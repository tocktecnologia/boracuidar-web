#!/usr/bin/env python3
"""Build and deploy the Vite site to HostGator via FTPS.

Workflow executado por este script:
1) npm ci
2) npm run build
3) gerar dist/.htaccess para SPA routing
4) carregar credenciais exclusivamente de deploy/workflow-hostgator/secrets.env
5) detectar diretorio remoto (WEB_FTP_DIR, /public_html, /www ou /)
6) limpar o diretorio remoto preservando entradas de infraestrutura conhecidas
7) subir dist/ via FTPS, ignorando arquivos *.map
8) atualizar um state file local com os hashes enviados
"""

from __future__ import annotations

import argparse
import ftplib
import hashlib
import io
import json
import os
import posixpath
import shutil
import socket
import ssl
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Set, Tuple


REQUIRED_SECRETS = ("WEB_FTP_SERVER", "WEB_FTP_USERNAME", "WEB_FTP_PASSWORD")
DEFAULT_STATE_FILE = ".ftp-deploy-sync-state-web.json"
DEFAULT_SECRETS_FILE = "secrets.env"
DEFAULT_MAINTENANCE_LOGO_FILENAME = "_maintenance_logo.png"
ROOT_PRESERVE_NAMES = {".ftpquota", ".well-known", "cgi-bin"}
FTP_RETRY_ERRORS = ftplib.all_errors + (socket.timeout, TimeoutError, EOFError, OSError)


@dataclass(frozen=True)
class DeployTarget:
    local_path: Path
    relative_posix: str


@dataclass(frozen=True)
class MaintenanceSettings:
    enabled: bool
    title: str
    message: str
    refresh_seconds: int
    logo_file_name: str


class TolerantFTP_TLS(ftplib.FTP_TLS):
    """FTP_TLS que tolera EOF SSL em sockets de dados."""

    def storbinary(self, cmd, fp, blocksize=8192, callback=None, rest=None):
        self.voidcmd("TYPE I")
        with self.transfercmd(cmd, rest) as conn:
            while True:
                buf = fp.read(blocksize)
                if not buf:
                    break
                conn.sendall(buf)
                if callback:
                    callback(buf)
            if isinstance(conn, ssl.SSLSocket):
                try:
                    conn.unwrap()
                except ssl.SSLEOFError:
                    pass
        return self.voidresp()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build and deploy the Vite site to HostGator.")
    parser.add_argument(
        "--base-href",
        default="/",
        help="Base href da aplicacao (ex: / ou /subpasta/). Default: /",
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=None,
        help="Caminho do repo root. Auto-detectado quando omitido.",
    )
    parser.add_argument(
        "--build-dir",
        type=Path,
        default=Path("dist"),
        help="Diretorio de build relativo ao repo root. Default: dist",
    )
    parser.add_argument(
        "--state-file",
        type=Path,
        default=Path(DEFAULT_STATE_FILE),
        help=f"State file relativo ao repo root. Default: {DEFAULT_STATE_FILE}",
    )
    parser.add_argument(
        "--server-dir",
        default=None,
        help="Diretorio de destino no FTP. Quando omitido, usa WEB_FTP_DIR ou autodetecta.",
    )
    parser.add_argument(
        "--build-only",
        action="store_true",
        help="Executa apenas o build e nao faz upload.",
    )
    parser.add_argument(
        "--skip-install",
        action="store_true",
        help="Pula npm ci e reutiliza node_modules atual.",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Pula npm run build e reutiliza o diretorio de build atual.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=180,
        help="Timeout FTPS em segundos. Default: 180",
    )
    parser.add_argument(
        "--maintenance-page",
        action=argparse.BooleanOptionalAction,
        default=True,
        help=(
            "Mostra uma pagina de manutencao durante o deploy e troca para o site "
            "somente no final (padrao: habilitado). Use --no-maintenance-page para desativar."
        ),
    )
    parser.add_argument(
        "--maintenance-title",
        default="Bora Cuidar em manutencao",
        help="Titulo da pagina de manutencao.",
    )
    parser.add_argument(
        "--maintenance-message",
        default="Estamos em manutencao e logo voltaremos a ficar disponiveis.",
        help="Mensagem principal da pagina de manutencao.",
    )
    parser.add_argument(
        "--maintenance-refresh-seconds",
        type=int,
        default=8,
        help="Intervalo de auto-refresh da pagina de manutencao (segundos).",
    )
    parser.add_argument(
        "--maintenance-logo-file",
        default=DEFAULT_MAINTENANCE_LOGO_FILENAME,
        help=(
            "Nome do arquivo da logo de manutencao no diretorio remoto do site "
            "(ex: _maintenance_logo.png)."
        ),
    )
    return parser.parse_args()


def log(message: str) -> None:
    print(f"[deploy-web] {message}")


def fail(message: str, exit_code: int = 1) -> None:
    print(f"[deploy-web] ERROR: {message}", file=sys.stderr)
    raise SystemExit(exit_code)


def find_repo_root(start: Path) -> Path:
    for current in [start, *start.parents]:
        has_package = (current / "package.json").exists()
        has_vite = any((current / name).exists() for name in ("vite.config.ts", "vite.config.js", "vite.config.mjs"))
        if has_package and has_vite:
            return current
    fail("Nao foi possivel detectar o repo root automaticamente. Use --repo-root.")
    raise AssertionError("unreachable")


def run_command(command: List[str], cwd: Path) -> None:
    executable = shutil.which(command[0])
    if executable is None and os.name == "nt":
        executable = shutil.which(f"{command[0]}.cmd") or shutil.which(f"{command[0]}.bat") or shutil.which(f"{command[0]}.exe")
    if executable is None:
        fail(f"Executavel nao encontrado no PATH: {command[0]}")

    resolved_command = [executable, *command[1:]]
    log(f"Executando: {' '.join(resolved_command)}")
    subprocess.run(resolved_command, cwd=cwd, check=True)


def install_dependencies(cwd: Path) -> None:
    try:
        run_command(["npm", "ci"], cwd=cwd)
    except subprocess.CalledProcessError as exc:
        stderr = ""
        if exc.stderr:
            stderr = exc.stderr.decode("utf-8", errors="ignore") if isinstance(exc.stderr, bytes) else str(exc.stderr)
        if os.name == "nt" and exc.returncode != 0:
            log(
                "Aviso: npm ci falhou no Windows possivelmente por arquivo bloqueado em node_modules. "
                "Seguindo com as dependencias atuais para concluir o deploy."
            )
            return
        raise


def normalize_rewrite_base(base_href: str) -> str:
    base = (base_href or "/").strip()
    if not base.startswith("/"):
        base = "/" + base
    if not base.endswith("/"):
        base += "/"
    return base


def generate_htaccess(build_dir: Path, base_href: str) -> None:
    rewrite_base = normalize_rewrite_base(base_href)
    content = (
        "<IfModule mod_rewrite.c>\n"
        "  RewriteEngine On\n"
        f"  RewriteBase {rewrite_base}\n"
        "  RewriteRule ^index\\.html$ - [L]\n"
        "  RewriteCond %{REQUEST_FILENAME} !-f\n"
        "  RewriteCond %{REQUEST_FILENAME} !-d\n"
        f"  RewriteRule . {rewrite_base}index.html [L]\n"
        "</IfModule>\n"
    )
    htaccess_path = build_dir / ".htaccess"
    htaccess_path.write_text(content, encoding="utf-8")
    log(f"Arquivo {htaccess_path} gerado com sucesso.")


def resolve_secrets_file(script_dir: Path) -> Path:
    env_file = script_dir / DEFAULT_SECRETS_FILE
    if not env_file.exists():
        fail(f"Arquivo de secrets nao encontrado: {env_file}")
    return env_file


def load_env_file(env_file: Path) -> Dict[str, str]:
    data: Dict[str, str] = {}
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip().strip("'").strip('"')
    return data


def validate_required_secrets(config: Dict[str, str]) -> None:
    missing = [name for name in REQUIRED_SECRETS if not config.get(name)]
    if missing:
        fail(f"Secrets ausentes em {DEFAULT_SECRETS_FILE}: {', '.join(missing)}")


def sha1_file(path: Path) -> str:
    digest = hashlib.sha1()
    with path.open("rb") as file_obj:
        for chunk in iter(lambda: file_obj.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def should_exclude(relative_posix: str) -> bool:
    return relative_posix.endswith(".map")


def normalize_file_name(value: str, fallback: str) -> str:
    text = (value or "").strip().replace("\\", "/")
    if not text:
        return fallback
    text = posixpath.basename(text)
    return text or fallback


def _pick_maintenance_logo_target(targets: List[DeployTarget]) -> DeployTarget | None:
    preferred = (
        "assets/brand/logo-horizontal-light.png",
        "assets/brand/icon-mark.png",
        "favicon.ico",
        "favicon.png",
    )
    by_relative = {target.relative_posix: target for target in targets}
    for relative in preferred:
        target = by_relative.get(relative)
        if target is not None and target.local_path.exists():
            return target

    for target in targets:
        relative = target.relative_posix.lower()
        if "logo" in relative and relative.endswith((".png", ".jpg", ".jpeg", ".webp", ".svg")):
            return target
    return None


def build_maintenance_html(settings: MaintenanceSettings) -> str:
    refresh = max(3, settings.refresh_seconds)
    title = (settings.title or "Bora Cuidar em manutencao").strip()
    message = (settings.message or "Estamos em manutencao e logo voltaremos a ficar disponiveis.").strip()
    logo_html = ""
    logo_file = normalize_file_name(settings.logo_file_name, DEFAULT_MAINTENANCE_LOGO_FILENAME) if settings.logo_file_name else ""
    if logo_file:
        logo_html = (
            f'<img src="/{logo_file}" alt="Logo Bora Cuidar" '
            'style="max-width:220px;max-height:120px;object-fit:contain;margin-bottom:20px;" />'
        )

    return f"""<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta http-equiv="refresh" content="{refresh}" />
    <style>
      :root {{
        color-scheme: light;
      }}
      * {{
        box-sizing: border-box;
      }}
      body {{
        margin: 0;
        min-height: 100vh;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #0f172a;
        background:
          radial-gradient(circle at top right, #dbeafe 0%, transparent 40%),
          radial-gradient(circle at bottom left, #dcfce7 0%, transparent 45%),
          #f8fafc;
        display: grid;
        place-items: center;
        padding: 20px;
      }}
      .card {{
        width: min(620px, 100%);
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid #e2e8f0;
        border-radius: 18px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
        padding: 32px 26px;
        text-align: center;
      }}
      h1 {{
        margin: 0 0 10px;
        font-size: 1.4rem;
      }}
      p {{
        margin: 0;
        color: #334155;
        line-height: 1.55;
      }}
      .spinner {{
        width: 28px;
        height: 28px;
        border-radius: 999px;
        border: 3px solid #cbd5e1;
        border-top-color: #2563eb;
        margin: 18px auto 0;
        animation: spin 0.9s linear infinite;
      }}
      @keyframes spin {{
        to {{ transform: rotate(360deg); }}
      }}
      .hint {{
        margin-top: 12px;
        font-size: 0.83rem;
        color: #64748b;
      }}
    </style>
  </head>
  <body>
    <main class="card">
      {logo_html}
      <h1>{title}</h1>
      <p>{message}</p>
      <div class="spinner" aria-hidden="true"></div>
      <p class="hint">Atualizacao automatica a cada {refresh} segundos.</p>
    </main>
  </body>
</html>
"""


def collect_deploy_targets(build_dir: Path) -> List[DeployTarget]:
    targets: List[DeployTarget] = []
    for path in sorted(build_dir.rglob("*")):
        if not path.is_file():
            continue
        relative_posix = path.relative_to(build_dir).as_posix()
        if should_exclude(relative_posix):
            continue
        targets.append(DeployTarget(local_path=path, relative_posix=relative_posix))
    return targets


def load_state(path: Path) -> Dict[str, Dict[str, str]]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        log(f"State file invalido ({path}), iniciando sincronizacao completa.")
        return {}
    files = payload.get("files", {})
    if not isinstance(files, dict):
        return {}
    normalized: Dict[str, Dict[str, str]] = {}
    for key, value in files.items():
        if isinstance(key, str) and isinstance(value, dict):
            normalized[key] = value
    return normalized


def save_state(path: Path, files: Dict[str, Dict[str, str]]) -> None:
    payload = {"version": 1, "files": files}
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def remote_join(server_dir: str, relative_posix: str) -> str:
    base = server_dir.strip() or "/"
    if not base.startswith("/"):
        base = "/" + base
    base = base.rstrip("/")
    if not base:
        base = "/"
    rel = relative_posix.lstrip("/")
    return f"/{rel}" if base == "/" else f"{base}/{rel}"


def normalize_remote_dir(server_dir: str | None) -> str:
    base = (server_dir or "/").strip()
    if not base.startswith("/"):
        base = "/" + base
    base = base.rstrip("/")
    return base or "/"


def ensure_remote_dirs(ftp: ftplib.FTP_TLS, remote_file: str, cache: Set[str]) -> None:
    parent = posixpath.dirname(remote_file)
    if not parent or parent in (".", "/"):
        return
    segments = [segment for segment in parent.split("/") if segment]
    current = ""
    for segment in segments:
        current = f"{current}/{segment}"
        if current in cache:
            continue
        try:
            ftp.mkd(current)
        except ftplib.error_perm as exc:
            if "550" not in str(exc):
                raise
        cache.add(current)


def remove_remote_file(ftp: ftplib.FTP_TLS, remote_file: str) -> bool:
    try:
        ftp.delete(remote_file)
        return True
    except ftplib.error_perm as exc:
        log(f"Aviso ao deletar {remote_file}: {exc}")
        return False


def _list_remote_children_mlsd(ftp: ftplib.FTP_TLS, remote_dir: str) -> Tuple[List[str], List[str]]:
    files: List[str] = []
    dirs: List[str] = []
    start_pwd = ftp.pwd()
    try:
        ftp.cwd(remote_dir)
        for name, facts in ftp.mlsd():
            if name in (".", ".."):
                continue
            entry = f"/{name}" if remote_dir == "/" else f"{remote_dir.rstrip('/')}/{name}"
            entry_type = (facts or {}).get("type", "").lower()
            if entry_type == "dir":
                dirs.append(entry)
            elif entry_type == "file":
                files.append(entry)
    finally:
        try:
            ftp.cwd(start_pwd)
        except ftplib.error_perm:
            pass
    return files, dirs


def _list_remote_children_nlst(ftp: ftplib.FTP_TLS, remote_dir: str) -> Tuple[List[str], List[str]]:
    files: List[str] = []
    dirs: List[str] = []
    start_pwd = ftp.pwd()

    try:
        ftp.cwd(remote_dir)
        raw_entries = ftp.nlst()
    except ftplib.error_perm as exc:
        if "550" in str(exc):
            return files, dirs
        raise
    finally:
        try:
            ftp.cwd(remote_dir)
        except ftplib.error_perm:
            pass

    normalized_remote_dir = remote_dir.rstrip("/") or "/"
    for raw_entry in raw_entries:
        entry = (raw_entry or "").strip()
        if not entry:
            continue
        normalized_entry = entry.rstrip("/") or "/"
        if normalized_entry == normalized_remote_dir:
            continue
        name_only = posixpath.basename(entry.rstrip("/"))
        if not name_only or name_only in (".", ".."):
            continue
        full_entry = f"/{name_only}" if remote_dir == "/" else f"{remote_dir.rstrip('/')}/{name_only}"
        try:
            ftp.cwd(name_only)
            dirs.append(full_entry.rstrip("/") or "/")
            ftp.cwd(remote_dir)
        except ftplib.error_perm:
            files.append(full_entry)
            try:
                ftp.cwd(remote_dir)
            except ftplib.error_perm:
                pass

    try:
        ftp.cwd(start_pwd)
    except ftplib.error_perm:
        pass

    return files, dirs


def list_remote_children(ftp: ftplib.FTP_TLS, remote_dir: str) -> Tuple[List[str], List[str]]:
    try:
        return _list_remote_children_mlsd(ftp, remote_dir)
    except (AttributeError, ftplib.error_perm, socket.timeout, TimeoutError, EOFError) as exc:
        log(f"Aviso: MLSD falhou em {remote_dir}, usando fallback NLST ({exc}).")
        return _list_remote_children_nlst(ftp, remote_dir)


def connect_ftps(*, server: str, username: str, password: str, port: int, timeout: int) -> TolerantFTP_TLS:
    ftp = TolerantFTP_TLS()
    ftp.connect(host=server, port=port, timeout=timeout)
    ftp.login(user=username, passwd=password)
    ftp.prot_p()
    ftp.set_pasv(True)
    return ftp


def remove_empty_remote_dirs(ftp: ftplib.FTP_TLS, candidates: Iterable[str]) -> None:
    for directory in sorted(set(candidates), key=lambda item: item.count("/"), reverse=True):
        if not directory or directory == "/":
            continue
        try:
            ftp.rmd(directory)
        except ftplib.error_perm:
            continue


def delete_known_remote_paths(
    ftp: ftplib.FTP_TLS,
    *,
    server_dir: str,
    relative_paths: Iterable[str],
) -> int:
    deleted_count = 0
    deleted_parent_dirs: Set[str] = set()
    seen: Set[str] = set()

    for relative_posix in sorted(set(relative_paths)):
        relative = (relative_posix or "").strip().lstrip("/")
        if not relative or relative in seen:
            continue
        seen.add(relative)
        remote_path = remote_join(server_dir, relative)
        if remove_remote_file(ftp, remote_path):
            deleted_count += 1
            deleted_parent_dirs.add(posixpath.dirname(remote_path))

    remove_empty_remote_dirs(ftp, deleted_parent_dirs)
    return deleted_count


def purge_remote_directory(
    ftp: ftplib.FTP_TLS,
    server_dir: str,
    *,
    preserve_top_level: Set[str] | None = None,
) -> int:
    """Deleta todo o conteudo de server_dir, preservando server_dir e entradas permitidas."""
    root = normalize_remote_dir(server_dir)
    preserve_names = preserve_top_level or set()
    deleted_files = 0

    if root != "/":
        try:
            ftp.cwd(root)
            ftp.cwd("/")
        except ftplib.error_perm:
            ftp.mkd(root)
            return 0

    to_visit = [root]
    discovered_dirs: List[str] = []

    while to_visit:
        current = to_visit.pop()
        files, dirs = list_remote_children(ftp, current)

        for remote_file in files:
            name = posixpath.basename(remote_file)
            if current == root and name in preserve_names:
                continue
            if remove_remote_file(ftp, remote_file):
                deleted_files += 1

        for directory in dirs:
            name = posixpath.basename(directory.rstrip("/"))
            if current == root and name in preserve_names:
                continue
            discovered_dirs.append(directory)
            to_visit.append(directory)

    for directory in sorted(set(discovered_dirs), key=lambda item: item.count("/"), reverse=True):
        if directory in ("", "/") or directory == root:
            continue
        try:
            ftp.rmd(directory)
        except ftplib.error_perm as exc:
            log(f"Aviso ao remover diretorio {directory}: {exc}")

    return deleted_files


def resolve_server_dir(
    ftp: ftplib.FTP_TLS,
    *,
    cli_server_dir: str | None,
    configured_server_dir: str | None,
) -> str:
    if cli_server_dir:
        resolved = normalize_remote_dir(cli_server_dir)
        log(f"Diretorio remoto definido por argumento: {resolved}")
        return resolved

    if configured_server_dir:
        resolved = normalize_remote_dir(configured_server_dir)
        log(f"Diretorio remoto definido em secrets.env: {resolved}")
        return resolved

    files, dirs = list_remote_children(ftp, "/")
    names = {posixpath.basename(entry.rstrip("/")) for entry in [*files, *dirs]}

    if "public_html" in names:
        log("Diretorio remoto autodetectado: /public_html")
        return "/public_html"
    if "www" in names:
        log("Diretorio remoto autodetectado: /www")
        return "/www"

    log("Diretorio remoto autodetectado: /")
    return "/"


def deploy_via_ftps(
    *,
    server: str,
    username: str,
    password: str,
    port: int,
    timeout: int,
    cli_server_dir: str | None,
    configured_server_dir: str | None,
    targets: List[DeployTarget],
    previous_state: Dict[str, Dict[str, str]],
    maintenance: MaintenanceSettings,
) -> Tuple[Dict[str, Dict[str, str]], int, int, str]:
    current_state: Dict[str, Dict[str, str]] = {}
    for target in targets:
        current_state[target.relative_posix] = {"sha1": sha1_file(target.local_path)}

    deferred_targets: List[DeployTarget] = []
    regular_targets: List[DeployTarget] = []
    for target in targets:
        if target.relative_posix == "index.html":
            deferred_targets.append(target)
        else:
            regular_targets.append(target)

    ftp = connect_ftps(
        server=server,
        username=username,
        password=password,
        port=port,
        timeout=timeout,
    )

    uploaded_count = 0
    deleted_count = 0
    remote_dir_cache: Set[str] = set()
    resolved_server_dir = "/"
    maintenance_logo_name = normalize_file_name(maintenance.logo_file_name, DEFAULT_MAINTENANCE_LOGO_FILENAME)

    def publish_maintenance_page() -> Set[str]:
        preserved: Set[str] = {"index.html"}
        logo_uploaded = False

        if maintenance.enabled and deferred_targets:
            logo_target = _pick_maintenance_logo_target(targets)
            if logo_target is not None:
                try:
                    logo_remote_path = remote_join(resolved_server_dir, maintenance_logo_name)
                    ensure_remote_dirs(ftp, logo_remote_path, remote_dir_cache)
                    with logo_target.local_path.open("rb") as logo_file:
                        ftp.storbinary(f"STOR {logo_remote_path}", logo_file)
                    logo_uploaded = True
                    preserved.add(maintenance_logo_name)
                    log(f"Logo de manutencao publicada em {logo_remote_path}")
                except FTP_RETRY_ERRORS as exc:
                    log(f"Aviso: falha ao publicar logo de manutencao ({exc}).")

            html = build_maintenance_html(
                MaintenanceSettings(
                    enabled=maintenance.enabled,
                    title=maintenance.title,
                    message=maintenance.message,
                    refresh_seconds=maintenance.refresh_seconds,
                    logo_file_name=maintenance_logo_name if logo_uploaded else "",
                ),
            )

            maintenance_index_remote = remote_join(resolved_server_dir, "index.html")
            ensure_remote_dirs(ftp, maintenance_index_remote, remote_dir_cache)
            ftp.storbinary(
                f"STOR {maintenance_index_remote}",
                io.BytesIO(html.encode("utf-8")),
            )
            log("Pagina de manutencao publicada. Deploy em andamento...")
        return preserved

    try:
        resolved_server_dir = resolve_server_dir(
            ftp,
            cli_server_dir=cli_server_dir,
            configured_server_dir=configured_server_dir,
        )

        known_remote_relatives = set(previous_state.keys()).union(target.relative_posix for target in targets)
        preserve_names = set(ROOT_PRESERVE_NAMES if normalize_remote_dir(resolved_server_dir) == "/" else set())

        if maintenance.enabled and deferred_targets:
            try:
                preserve_names.update(publish_maintenance_page())
            except FTP_RETRY_ERRORS as exc:
                log(f"Aviso: nao foi possivel publicar manutencao antes da limpeza ({exc}).")

        try:
            deleted_count = purge_remote_directory(
                ftp,
                resolved_server_dir,
                preserve_top_level=preserve_names,
            )
        except FTP_RETRY_ERRORS as exc:
            log(
                "Aviso: limpeza remota completa falhou; "
                f"fallback para limpeza por manifesto ({exc})."
            )
            try:
                ftp.quit()
            except Exception:
                ftp.close()
            ftp = connect_ftps(
                server=server,
                username=username,
                password=password,
                port=port,
                timeout=timeout,
            )
            remote_dir_cache.clear()
            resolved_server_dir = resolve_server_dir(
                ftp,
                cli_server_dir=cli_server_dir,
                configured_server_dir=configured_server_dir,
            )
            deleted_count = delete_known_remote_paths(
                ftp,
                server_dir=resolved_server_dir,
                relative_paths=known_remote_relatives,
            )

        if maintenance.enabled and deferred_targets:
            try:
                publish_maintenance_page()
            except FTP_RETRY_ERRORS as exc:
                log(f"Aviso: nao foi possivel republicar manutencao apos limpeza ({exc}).")

        log(f"Arquivos removidos no remoto antes do upload: {deleted_count}")

        upload_plan = [*regular_targets, *deferred_targets]
        max_upload_retries = 4
        for target in upload_plan:
            remote_path = remote_join(resolved_server_dir, target.relative_posix)
            for attempt in range(1, max_upload_retries + 1):
                try:
                    ensure_remote_dirs(ftp, remote_path, remote_dir_cache)
                    with target.local_path.open("rb") as file_obj:
                        ftp.storbinary(f"STOR {remote_path}", file_obj)
                    uploaded_count += 1
                    break
                except FTP_RETRY_ERRORS as exc:
                    if attempt >= max_upload_retries:
                        raise
                    log(
                        f"Aviso: falha no upload de {remote_path} "
                        f"(tentativa {attempt}/{max_upload_retries}): {exc}. Reconectando."
                    )
                    try:
                        ftp.quit()
                    except Exception:
                        ftp.close()
                    ftp = connect_ftps(
                        server=server,
                        username=username,
                        password=password,
                        port=port,
                        timeout=timeout,
                    )
                    remote_dir_cache.clear()
                    resolved_server_dir = resolve_server_dir(
                        ftp,
                        cli_server_dir=cli_server_dir,
                        configured_server_dir=configured_server_dir,
                    )
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()

    return current_state, uploaded_count, deleted_count, resolved_server_dir


def main() -> None:
    args = parse_args()
    script_dir = Path(__file__).resolve().parent
    repo_root = args.repo_root.resolve() if args.repo_root else find_repo_root(script_dir)
    build_dir = (repo_root / args.build_dir).resolve() if not args.build_dir.is_absolute() else args.build_dir.resolve()
    state_file = (repo_root / args.state_file).resolve() if not args.state_file.is_absolute() else args.state_file.resolve()
    secrets_file = resolve_secrets_file(script_dir)
    maintenance_settings = MaintenanceSettings(
        enabled=bool(args.maintenance_page),
        title=args.maintenance_title,
        message=args.maintenance_message,
        refresh_seconds=max(3, args.maintenance_refresh_seconds),
        logo_file_name=normalize_file_name(args.maintenance_logo_file, DEFAULT_MAINTENANCE_LOGO_FILENAME),
    )

    log(f"Repo root: {repo_root}")
    log(f"Build dir: {build_dir}")
    log(f"Arquivo de secrets: {secrets_file}")

    if not args.skip_install:
        install_dependencies(repo_root)
    else:
        log("Skip install habilitado: reutilizando node_modules atual.")

    if not args.skip_build:
        run_command(["npm", "run", "build"], cwd=repo_root)
    else:
        log("Skip build habilitado: reutilizando artefatos existentes.")

    if not build_dir.exists():
        fail(f"Diretorio de build nao encontrado: {build_dir}")

    generate_htaccess(build_dir, args.base_href)
    targets = collect_deploy_targets(build_dir)
    if not targets:
        fail("Nenhum arquivo de deploy encontrado apos o build.")

    if args.build_only:
        log("Modo build-only: upload FTPS ignorado.")
        return

    secrets = load_env_file(secrets_file)
    validate_required_secrets(secrets)

    ftp_server = secrets["WEB_FTP_SERVER"]
    ftp_username = secrets["WEB_FTP_USERNAME"]
    ftp_password = secrets["WEB_FTP_PASSWORD"]
    ftp_port_text = secrets.get("WEB_FTP_PORT", "21").strip() or "21"
    configured_server_dir = secrets.get("WEB_FTP_DIR", "").strip() or None

    try:
        ftp_port = int(ftp_port_text)
    except ValueError:
        fail(f"WEB_FTP_PORT invalido: {ftp_port_text}")
        raise AssertionError("unreachable")

    previous_state = load_state(state_file)
    new_state, uploaded_count, deleted_count, resolved_server_dir = deploy_via_ftps(
        server=ftp_server,
        username=ftp_username,
        password=ftp_password,
        port=ftp_port,
        timeout=args.timeout,
        cli_server_dir=args.server_dir,
        configured_server_dir=configured_server_dir,
        targets=targets,
        previous_state=previous_state,
        maintenance=maintenance_settings,
    )
    save_state(state_file, new_state)

    log(f"Diretorio remoto usado: {resolved_server_dir}")
    log(f"Deploy concluido. Uploads: {uploaded_count}, removidos no remoto: {deleted_count}")
    log(f"State file atualizado em: {state_file}")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        fail(f"Comando falhou com exit code {exc.returncode}: {' '.join(exc.cmd)}", exit_code=exc.returncode)
