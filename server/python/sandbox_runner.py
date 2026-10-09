#!/usr/bin/env python3
"""
Nexusora Workforce — locked-down Python sandbox for AI-written analysis.

Runs UNTRUSTED code (written by Claude in response to an HR question) against a
dataset, with defence in depth:

  1. Separate process, launched by Node with `python3 -I` (isolated mode).
  2. OS resource limits (address space, CPU time, no file writes, few fds).
  3. AST guard: no imports, no dunder access, no dangerous builtins
     (eval/exec/open/getattr/__import__/…). Modules are pre-injected.
  4. Restricted __builtins__: the code only sees a safe, curated set.
  5. No network / filesystem: nothing is importable, open() is gone,
     RLIMIT_FSIZE is 0, and the whole thing is time-boxed by the parent too.

Protocol: reads {"code": "...", "data": [ {col: val}, ... ]} on stdin;
writes {"ok": bool, "result": {...}, "charts": [b64png...], "stdout": "...",
"error": "..."} to stdout. Numbers are computed from the data — never invented.
"""
import sys
import json
import ast
import io
import base64

# ---- hard resource limits (best-effort; applied before running user code) ---
LIMIT_AS = 1536 * 1024 * 1024  # 1.5 GB address space (fits the SciPy/sklearn
#                                mmaps + a tenant dataset; still kills multi-GB
#                                allocation bombs with wide margin)
LIMIT_CPU = 12                 # 12 s CPU seconds (parent also wall-clock bounds us)


def set_limits():
    try:
        import resource
    except Exception:
        return
    for res, soft in (
        (getattr(resource, 'RLIMIT_AS', None), LIMIT_AS),
        (getattr(resource, 'RLIMIT_CPU', None), LIMIT_CPU),
        (getattr(resource, 'RLIMIT_FSIZE', None), 0),      # no file writes
        (getattr(resource, 'RLIMIT_NOFILE', None), 64),
    ):
        if res is None:
            continue
        try:
            resource.setrlimit(res, (soft, soft))
        except Exception:
            pass


# --------------------------------------------------------------------------- #
#  AST guard — static analysis of the code before it ever runs
# --------------------------------------------------------------------------- #
FORBIDDEN_NAMES = {
    'eval', 'exec', 'compile', 'open', 'input', '__import__', 'globals', 'locals',
    'vars', 'getattr', 'setattr', 'delattr', 'hasattr', 'breakpoint', 'exit',
    'quit', 'help', 'memoryview', 'type', 'object', 'super', 'classmethod',
    'staticmethod', 'property', 'dir', 'id', 'hash', 'copyright', 'credits',
    'license', 'input', 'bytearray', 'getstate', 'setstate',
}
# Attribute names that are never allowed (dunder + known escape vectors).
FORBIDDEN_ATTR_SUBSTR = ('__',)

# pandas/numpy ship their own file + network I/O that opens handles internally,
# bypassing the open()/import/socket blocks: pd.read_csv('/etc/passwd') reads any
# file, pd.read_html('http://x/') fetches a URL (exfiltration), pd.read_pickle /
# np.load deserialise pickles (RCE). None of these are needed for analysis — df is
# pre-loaded and output goes through `result` — so every I/O entry point is blocked
# at the AST level. In-memory converters (to_dict, to_numpy, to_string, …) stay.
_IO_ATTRS = {
    # str.format / format_map traverse attributes at runtime from a literal,
    # slipping past the AST attribute check. Builtin format() (a Name) is unaffected.
    'format', 'format_map', 'mro', 'maketrans',
    # pandas readers (file + URL + pickle)
    'read_csv', 'read_table', 'read_fwf', 'read_excel', 'read_json', 'read_html',
    'read_xml', 'read_parquet', 'read_orc', 'read_feather', 'read_hdf', 'read_stata',
    'read_sas', 'read_spss', 'read_pickle', 'read_sql', 'read_sql_query',
    'read_sql_table', 'read_gbq', 'read_clipboard',
    # pandas writers that touch files / networks / DBs (in-memory to_* kept)
    'to_csv', 'to_excel', 'to_json', 'to_html', 'to_xml', 'to_parquet', 'to_orc',
    'to_feather', 'to_hdf', 'to_stata', 'to_pickle', 'to_sql', 'to_gbq',
    'to_clipboard',
    # file/store openers
    'ExcelFile', 'ExcelWriter', 'HDFStore',
    # numpy I/O
    'load', 'save', 'savez', 'savez_compressed', 'fromfile', 'tofile', 'loadtxt',
    'savetxt', 'genfromtxt', 'memmap', 'fromregex', 'DataSource',
    # expression evaluators with historic escapes
    'eval', 'query',
    # submodule hops and os/process surface, in case a module re-exposes them
    'io', 'lib', 'os', 'sys', 'subprocess', 'ctypes', 'system', 'popen', 'Popen',
    'loads', 'dumps',
}
FORBIDDEN_ATTRS = _IO_ATTRS


class Guard(ast.NodeVisitor):
    def fail(self, msg):
        raise ValueError(msg)

    def visit_Import(self, node):
        self.fail('imports are not allowed — use the provided pd, np, sm, plt')

    def visit_ImportFrom(self, node):
        self.fail('imports are not allowed — use the provided pd, np, sm, plt')

    def visit_Attribute(self, node):
        if any(s in node.attr for s in FORBIDDEN_ATTR_SUBSTR):
            self.fail('access to "%s" is not allowed' % node.attr)
        if node.attr in FORBIDDEN_ATTRS:
            self.fail('access to "%s" is not allowed' % node.attr)
        self.generic_visit(node)

    def visit_Name(self, node):
        if node.id.startswith('__'):
            self.fail('names starting with "__" are not allowed: %s' % node.id)
        if node.id in FORBIDDEN_NAMES:
            self.fail('use of "%s" is not allowed' % node.id)
        self.generic_visit(node)

    def visit_Call(self, node):
        # also catch getattr(...) etc. used as bare calls (covered by visit_Name too)
        self.generic_visit(node)


def guard(code):
    try:
        tree = ast.parse(code, mode='exec')
    except SyntaxError as e:
        raise ValueError('syntax error: %s' % e)
    Guard().visit(tree)
    return compile(tree, '<analysis>', 'exec')


# --------------------------------------------------------------------------- #
#  Safe namespace
# --------------------------------------------------------------------------- #
# Top-level modules that may NEVER be imported, even by library internals. The
# scientific stack lazy-imports its own submodules at runtime (numpy's
# ndarray.mean pulls in numpy._core._methods, etc.), so __builtins__ must carry a
# working __import__ — but a filtered one. User code cannot reach it (the name
# "__import__" and all import statements are AST-blocked, and imported modules
# never enter the user namespace); this blocklist is defence-in-depth against a
# library function being coerced into importing an attacker-named module.
DENY_IMPORT = {
    'os', 'subprocess', 'socket', 'shutil', 'ctypes', '_ctypes', 'ctypes.util',
    'cffi', 'pty', 'posix', 'nt', '_posixsubprocess', 'signal', 'fcntl', 'mmap',
    'multiprocessing', 'pickle', '_pickle', 'cpickle', 'marshal', 'shelve', 'dbm',
    'sqlite3', 'importlib', 'imp', 'runpy', 'code', 'codeop', 'pdb', 'bdb',
    'trace', 'tracemalloc', 'gc', 'resource', 'tempfile', 'glob', 'fileinput',
    'pathlib', 'http', 'urllib', 'urllib2', 'urllib3', 'ftplib', 'smtplib',
    'poplib', 'imaplib', 'telnetlib', 'ssl', 'requests', 'aiohttp', 'httpx',
    'paramiko', 'webbrowser', 'pip', 'venv', 'distutils', 'setuptools',
    'pkg_resources', 'ensurepip', 'asyncio', 'select', 'selectors', 'xmlrpc',
    'ft002', 'commands', 'popen2', 'os2emxpath',
}


def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    root = (name or '').split('.')[0]
    if name in DENY_IMPORT or root in DENY_IMPORT:
        raise ImportError('import of "%s" is not allowed in the analysis sandbox' % name)
    import builtins as _b
    return _b.__import__(name, globals, locals, fromlist, level)


def safe_builtins():
    import builtins as _b
    allow = [
        'abs', 'all', 'any', 'bool', 'dict', 'divmod', 'enumerate', 'filter',
        'float', 'int', 'len', 'list', 'map', 'min', 'max', 'pow', 'print',
        'range', 'reversed', 'round', 'set', 'slice', 'sorted', 'str', 'sum',
        'tuple', 'zip', 'frozenset', 'bytes', 'complex', 'ord', 'chr', 'repr',
        'isinstance', 'issubclass', 'format', 'hex', 'oct', 'bin', 'abs',
    ]
    out = {k: getattr(_b, k) for k in allow if hasattr(_b, k)}
    out['True'], out['False'], out['None'] = True, False, None
    out['__build_class__'] = None     # disable class creation via __build_class__
    out['__import__'] = _safe_import  # library internals only; user code is AST-blocked
    # a few harmless, read-only exceptions libraries reference
    for exc in ('Exception', 'ValueError', 'TypeError', 'KeyError', 'IndexError',
                'ZeroDivisionError', 'ArithmeticError', 'RuntimeError',
                'StopIteration', 'AttributeError', 'NotImplementedError',
                'OverflowError', 'FloatingPointError', 'MemoryError'):
        if hasattr(_b, exc):
            out[exc] = getattr(_b, exc)
    return out


def main():
    set_limits()
    raw = sys.stdin.read()
    try:
        job = json.loads(raw or '{}')
    except Exception as e:
        print(json.dumps({'ok': False, 'error': 'bad job: %s' % e}))
        return
    code = job.get('code') or ''
    data = job.get('data') or []

    # Guard the code first; a failure here means we never execute it.
    try:
        compiled = guard(code)
    except ValueError as e:
        print(json.dumps({'ok': False, 'error': 'blocked: %s' % e, 'blocked': True}))
        return

    # Pre-import the whitelisted scientific stack (trusted — not user code).
    ns = {'__builtins__': safe_builtins(), 'result': {}, 'charts': []}
    try:
        import pandas as pd
        import numpy as np
        ns['pd'] = pd
        ns['np'] = np
        ns['df'] = pd.DataFrame(data)
    except Exception as e:
        print(json.dumps({'ok': False, 'error': 'engine not available: %s' % e}))
        return
    for name, mod in (('sklearn', 'sklearn'), ('sm', 'statsmodels.api'), ('stats', 'scipy.stats')):
        try:
            ns[name] = __import__(mod, fromlist=['*'])
        except Exception:
            pass
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        ns['plt'] = plt
    except Exception:
        plt = None

    # Run the user code with stdout captured.
    buf = io.StringIO()
    old = sys.stdout
    sys.stdout = buf
    err = None
    try:
        exec(compiled, ns)
    except Exception as e:  # noqa
        err = '%s: %s' % (type(e).__name__, e)
    finally:
        sys.stdout = old

    charts = []
    if plt is not None:
        try:
            for num in plt.get_fignums()[:6]:
                fig = plt.figure(num)
                b = io.BytesIO()
                fig.savefig(b, format='png', dpi=90, bbox_inches='tight')
                charts.append(base64.b64encode(b.getvalue()).decode('ascii'))
            plt.close('all')
        except Exception:
            pass

    # Only JSON-serialisable parts of result survive.
    def clean(v, depth=0):
        if depth > 6:
            return str(v)
        if isinstance(v, (str, int, float, bool)) or v is None:
            return v
        if isinstance(v, dict):
            return {str(k): clean(x, depth + 1) for k, x in list(v.items())[:200]}
        if isinstance(v, (list, tuple)):
            return [clean(x, depth + 1) for x in list(v)[:500]]
        try:
            import numpy as _np
            if isinstance(v, _np.generic):
                return v.item()
            if isinstance(v, _np.ndarray):
                return clean(v.tolist(), depth + 1)
        except Exception:
            pass
        return str(v)

    out = {
        'ok': err is None,
        'result': clean(ns.get('result', {})),
        'charts': charts,
        'stdout': buf.getvalue()[:4000],
    }
    if err:
        out['error'] = err
    print(json.dumps(out))


if __name__ == '__main__':
    main()
