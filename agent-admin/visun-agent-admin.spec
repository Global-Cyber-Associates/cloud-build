# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[('functions', 'functions'), ('visualizer-scanner', 'visualizer-scanner'), ('C:\\Users\\Admin\\AppData\\Local\\Programs\\Python\\Python311\\Lib\\site-packages\\scapy', 'scapy')],
    hiddenimports=['scapy', 'scapy.all', 'scapy.layers', 'scapy.layers.l2', 'scapy.layers.inet', 'scapy.layers.inet6', 'scapy.sendrecv', 'scapy.arch.windows', 'scapy.route', 'netifaces', 'psutil'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='visun-agent-admin',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['gca.ico'],
)
