import { Sandbox } from "@vercel/sandbox";
import { all } from "better-all";
import { setGoldenSnapshotId } from "./golden-snapshot";
import { SANDBOX_PORTS } from "./ports";
import { getServiceCode } from "./sandbox-services";
import {
  getCliDisplayStartScript,
  getDisplayStartScript,
  getEcosystemConfig,
  getKasmVncStartScript,
  getNoVncStartScript,
  getRdpStartScript,
  getVncStartScript,
  getWebRtcStartScript,
  getXpraStartScript,
  getSandboxBridgeScript,
  SERVICE_DIR,
  XPRA_DISPLAY,
} from "./ecosystem-config";
import type { WorkspaceExperience } from "@/types/workspace";
import { getCodeServerFiles } from "./vscode";

const XPRA_LTS = "https://xpra.org/lts/almalinux/9/x86_64";
const XPRA_STABLE = "https://xpra.org/stable/almalinux/9/x86_64";

const XPRA_CSP = `Content-Security-Policy: script-src 'self' 'unsafe-inline' ; font-src 'self' ; object-src 'none' ; child-src 'self' ; worker-src 'self' ; frame-ancestors * ; form-action 'self' ;
Cross-Origin-Resource-Policy: cross-origin
Access-Control-Allow-Origin: *
Referrer-Policy: no-referrer`;

export interface GoldenSnapshotResult {
  snapshotId: string;
  status: string;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string;
}

export async function buildGoldenSnapshot(options?: {
  installScript?: string;
  logPrefix?: string;
  experience?: WorkspaceExperience;
  persistAsPlatformDefault?: boolean;
  onLog?: (line: string) => void | Promise<void>;
}): Promise<GoldenSnapshotResult> {
  const prefix = options?.logPrefix ?? "golden-snapshot";
  const installScript = options?.installScript;
  const experience = options?.experience ?? "gui";
  const persistAsPlatformDefault = options?.persistAsPlatformDefault ?? true;
  const onLog = options?.onLog;

  const log = async (line: string) => {
    console.log(`[${prefix}] ${line}`);
    await onLog?.(`[${prefix}] ${line}`);
  };

  const sandbox = await Sandbox.create({
    runtime: "node24",
    ports: SANDBOX_PORTS,
    timeout: 10 * 60 * 1000,
  });

  const runStep = async (label: string, cmd: string) => {
    await log(`${label}...`);
    const result = await sandbox.runCommand({
      cmd: "bash",
      args: ["-c", cmd],
    });
    if (result.exitCode !== 0) {
      const stderr = await result.stderr();
      throw new Error(`[${prefix}] ${label} failed: ${stderr}`);
    }
    await log(`${label} done`);
    return result;
  };

  // Resolve $HOME inside the sandbox (it's /home/vercel-sandbox, NOT /vercel/sandbox)
  const homeResult = await sandbox.runCommand({
    cmd: "bash",
    args: ["-c", "echo $HOME"],
  });
  const HOME = (await homeResult.stdout()).trim() || "/home/vercel-sandbox";
  await log(`Sandbox HOME=${HOME}`);

  // Vercel Sandbox containers don't support cap_set_file (file capabilities).
  // Some RPMs (e.g. gstreamer1) set capabilities on binaries during install,
  // which causes "cpio: cap_set_file failed - Operation not permitted".
  // Setting tsflags=nocaps tells rpm to skip capability bits.
  await runStep(
    "Configure dnf nocaps",
    "echo 'tsflags=nocaps' | sudo tee -a /etc/dnf/dnf.conf > /dev/null",
  );

  // ---------------------------------------------------------------------------
  // Dependency graph (managed by better-all — each task declares its deps via
  // `await this.$.<task>` and all() handles optimal parallelization):
  //
  //   dnfPackages ──┬──> xpraInstall (also depends on xpraDownload)
  //                 ├──> sysConfig
  //                 └──> firefoxProfile
  //   codeServer ─────> codeServerExtensions
  //   npmGlobals ─────> serviceFiles
  //   xdgDesktop        (no deps)
  //   customScript      (no deps, optional)
  // ---------------------------------------------------------------------------

  const sysConfigScript = `
sudo tee /etc/xpra/http-headers/10_content_security_policy.txt > /dev/null << 'XPRACSP'
${XPRA_CSP}
XPRACSP

# Disable fake Xinerama -- libfakeXinerama is not available on Amazon Linux 2023
# and the single-display sandbox doesn't need multi-monitor emulation.
# Without this, Xpra sets LD_PRELOAD to a nonexistent .so, causing warnings.
sudo tee /etc/xpra/conf.d/99_vdesk.conf > /dev/null << 'XPRACONF'
fake-xinerama=no
XPRACONF

# Allow non-console users to run Xorg (needed for Xdummy)
sudo mkdir -p /etc/X11
sudo tee /etc/X11/Xwrapper.config > /dev/null << 'XWRAPEOF'
allowed_users=anybody
XWRAPEOF

sudo tee /etc/profile.d/sandbox-display.sh > /dev/null << 'PROFILEEOF'
export DISPLAY=${XPRA_DISPLAY}
export DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/vdesk-dbus
export GIO_USE_SYSTEMD=0
PROFILEEOF

# Default GTK theme (user's theme sync will override at runtime)
#
# CSD (Client-Side Decorations) hiding strategy:
# GTK4/libadwaita apps draw their own titlebar (headerbar) as part of the
# window content. Since Xpra streams the full window pixels and we wrap
# them in our own window frame, users see a double titlebar.
#
# We hide GTK's CSD via three mechanisms:
# 1. gtk-decoration-layout= (empty) -- removes window control buttons
# 2. Custom gtk.css -- collapses the headerbar to zero height
# 3. CSD shadow/border removal -- prevents extra padding around windows
#
# This preserves the app's menu bar and content area while removing
# only the decorative titlebar chrome.
mkdir -p ~/.config/gtk-3.0 ~/.config/gtk-4.0
cat > ~/.config/gtk-3.0/settings.ini << 'GTKEOF'
[Settings]
gtk-application-prefer-dark-theme=1
gtk-theme-name=Adwaita-dark
gtk-decoration-layout=
GTKEOF
cat > ~/.config/gtk-4.0/settings.ini << 'GTKEOF'
[Settings]
gtk-application-prefer-dark-theme=1
gtk-theme-name=Adwaita-dark
gtk-decoration-layout=
GTKEOF

# GTK4/libadwaita CSS -- collapse headerbars and CSD shadow
cat > ~/.config/gtk-4.0/gtk.css << 'GTKCSSEOF'
/* Hide the headerbar (CSD titlebar) completely */
headerbar {
  min-height: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}
headerbar > * {
  min-height: 0;
  min-width: 0;
  margin: 0;
  padding: 0;
}
headerbar title,
headerbar .title,
headerbar windowcontrols {
  opacity: 0;
  min-height: 0;
  min-width: 0;
}
/* Remove CSD shadow and border -- Xpra captures these as extra pixels */
window.csd,
window.csd decoration {
  box-shadow: none;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 0;
}
GTKCSSEOF

# GTK3 CSS equivalent
cat > ~/.config/gtk-3.0/gtk.css << 'GTKCSSEOF'
.titlebar,
headerbar {
  min-height: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}
.titlebar > *,
headerbar > * {
  min-height: 0;
  min-width: 0;
  margin: 0;
  padding: 0;
}
.titlebar .title,
headerbar .title {
  font-size: 0;
}
window.csd decoration {
  box-shadow: none;
  margin: 0;
  border-radius: 0;
  border: none;
}
GTKCSSEOF

sudo tee /etc/profile.d/sandbox-gtk-theme.sh > /dev/null << 'GTKENVEOF'
export GTK_THEME=Adwaita-dark
GTKENVEOF

# Rename Nautilus's .desktop entry so our JS Files app doesn't conflict
if [ -f /usr/share/applications/org.gnome.Nautilus.desktop ]; then
  sudo sed -i 's/^Name=Files$/Name=Nautilus/' /usr/share/applications/org.gnome.Nautilus.desktop
fi

# Shell aliases for new apps
sudo tee /etc/profile.d/sandbox-aliases.sh > /dev/null << 'ALIASEOF'
alias editor=vim
ALIASEOF
`;

  const firefoxProfileScript = `
if command -v firefox &> /dev/null; then
  FIREFOX_PROFILE_DIR="$HOME/.mozilla/firefox"

  # Create profile using Firefox headless mode
  DISPLAY=${XPRA_DISPLAY} firefox --headless --createprofile "default $FIREFOX_PROFILE_DIR/default" 2>/dev/null || true
  sleep 1

  # Set Default=1 in profiles.ini
  if [ -f "$FIREFOX_PROFILE_DIR/profiles.ini" ]; then
    if ! grep -q "^Default=1" "$FIREFOX_PROFILE_DIR/profiles.ini"; then
      sed -i '/^\\[Profile0\\]/a Default=1' "$FIREFOX_PROFILE_DIR/profiles.ini"
    fi
  fi

  # User preferences: skip first-run, disable HW accel (no GPU in sandbox)
  if [ -d "$FIREFOX_PROFILE_DIR/default" ]; then
    cat > "$FIREFOX_PROFILE_DIR/default/user.js" << 'USERJS_EOF'
user_pref("browser.startup.homepage", "about:blank");
user_pref("browser.startup.page", 1);
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("startup.homepage_welcome_url", "");
user_pref("startup.homepage_welcome_url.additional", "");
user_pref("browser.startup.firstrunSkipsHomepage", true);
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
user_pref("browser.aboutwelcome.enabled", false);
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
user_pref("gfx.webrender.all", false);
user_pref("layers.acceleration.disabled", true);
user_pref("browser.tabs.warnOnClose", false);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.rights.3.shown", true);
USERJS_EOF
  fi

  # Create installs.ini so Firefox doesn't ask to set default
  FIREFOX_PATH=$(dirname "$(readlink -f "$(command -v firefox)")")
  INSTALL_HASH=$(echo -n "$FIREFOX_PATH" | tr '[:upper:]' '[:lower:]' | md5sum | cut -c1-16 | tr '[:lower:]' '[:upper:]')
  cat > "$FIREFOX_PROFILE_DIR/installs.ini" << INSTALLS_EOF
[\$INSTALL_HASH]
Default=default
Locked=1
INSTALLS_EOF
  echo "Firefox profile created"
else
  echo "Firefox not found, skipping profile setup"
fi
  `;

  const cargoPathScript = `
set -euo pipefail

# Ensure Cargo-installed binaries (e.g. viu) are available in login shells
sudo tee /etc/profile.d/sandbox-cargo-path.sh > /dev/null << 'CARGOPATHEOF'
if [ -d "$HOME/.cargo/bin" ]; then
  case ":$PATH:" in
    *":$HOME/.cargo/bin:"*) ;;
    *) export PATH="$HOME/.cargo/bin:$PATH" ;;
  esac
fi
CARGOPATHEOF

# Also persist in user shell rc/profile files for non-login shell sessions
for rc in "$HOME/.profile" "$HOME/.bash_profile" "$HOME/.bashrc"; do
  touch "$rc"
  grep -q 'export PATH="$HOME/.cargo/bin:$PATH"' "$rc" || \
    echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> "$rc"
done
`;

  const displayDepsScript = `
set -euo pipefail

# VNC server backend for noVNC/VNC/KasmVNC fallback
sudo dnf install -y tigervnc-server-minimal || sudo dnf install -y tigervnc-server

# websockify runtime used by display-start scripts
python3 -m pip install --user --upgrade pip
python3 -m pip install --user websockify
python3 -c "import websockify"

# noVNC static web client (distro package is not consistently available)
mkdir -p ${SERVICE_DIR}
if [ ! -f "${SERVICE_DIR}/novnc/vnc.html" ]; then
  rm -rf /tmp/novnc-src
  git clone --depth 1 https://github.com/novnc/noVNC.git /tmp/novnc-src
  rm -rf "${SERVICE_DIR}/novnc"
  mv /tmp/novnc-src "${SERVICE_DIR}/novnc"
fi
test -f "${SERVICE_DIR}/novnc/vnc.html"

# RDP daemon (prefer package, fallback to source build)
if ! command -v xrdp >/dev/null 2>&1; then
  sudo dnf install -y xrdp || true
fi

if ! command -v xrdp >/dev/null 2>&1; then
  sudo dnf install -y gcc gcc-c++ make autoconf automake libtool pkgconfig nasm \
    openssl-devel pam-devel libX11-devel libXfixes-devel libXrandr-devel libxkbfile-devel \
    fuse-devel pixman-devel systemd-devel
  rm -rf /tmp/xrdp-src
  git clone --depth 1 --branch v0.10.3 https://github.com/neutrinolabs/xrdp.git /tmp/xrdp-src
  cd /tmp/xrdp-src
  ./bootstrap
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var
  make -j"$(nproc)"
  sudo make install
  sudo ldconfig || true
fi

find_bin() {
  local name="$1"
  shift
  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return 0
  fi
  for p in "$@"; do
    if [ -x "$p" ]; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

XRDP_BIN="$(find_bin xrdp /usr/sbin/xrdp /usr/local/sbin/xrdp)" || {
  echo "xrdp binary not found after install/build" >&2
  exit 1
}
XRDP_SESMAN_BIN="$(find_bin xrdp-sesman /usr/sbin/xrdp-sesman /usr/local/sbin/xrdp-sesman)" || {
  echo "xrdp-sesman binary not found after install/build" >&2
  exit 1
}
VNC_BIN="$(
  find_bin x11vnc /usr/bin/x11vnc /usr/local/bin/x11vnc ||
  find_bin x0vncserver /usr/bin/x0vncserver /usr/local/bin/x0vncserver ||
  find_bin Xvnc /usr/bin/Xvnc /usr/local/bin/Xvnc
)" || {
  echo "No supported VNC backend found (x11vnc, x0vncserver, or Xvnc)" >&2
  exit 1
}

echo "Verified display prereqs:"
echo "  xrdp: $XRDP_BIN"
echo "  xrdp-sesman: $XRDP_SESMAN_BIN"
echo "  vnc backend: $VNC_BIN"
`;

  if (experience === "cli") {
    await all({
      async cliBasePackages() {
        return runStep(
          "CLI base packages",
          [
            "sudo dnf install -y git python3 python3-pip tmux jq tree wget unzip tar gzip xz vim-enhanced cargo rust gcc gcc-c++ make",
            "sudo ln -sf /usr/bin/vim /usr/local/bin/vi",
          ].join(" && "),
        );
      },
      async cargoPath() {
        await this.$.cliBasePackages;
        return runStep("Configure Cargo PATH", cargoPathScript);
      },
      async npmGlobals() {
        await this.$.cargoPath;
        return runStep(
          "pm2 + Bun + pnpm",
          [
            // pm2 is required for runtime orchestration
            "npm install -g pm2",
            "curl -fsSL https://bun.sh/install | bash || true",
            "corepack enable && corepack prepare pnpm@latest --activate || true",
          ].join(" && "),
        );
      },
      async serviceFiles() {
        await this.$.npmGlobals;
        await sandbox.runCommand({
          cmd: "bash",
          args: [
            "-c",
            `sudo mkdir -p ${SERVICE_DIR} && sudo chown $(whoami) ${SERVICE_DIR}`,
          ],
        });
        await sandbox.writeFiles([
          {
            path: `${SERVICE_DIR}/service.js`,
            content: Buffer.from(getServiceCode()),
          },
          {
            path: `${SERVICE_DIR}/package.json`,
            content: Buffer.from('{"name":"vdesk-services","private":true}'),
          },
          {
            path: `${SERVICE_DIR}/ecosystem.config.js`,
            content: Buffer.from(getEcosystemConfig()),
          },
          {
            path: `${SERVICE_DIR}/display-start.sh`,
            content: Buffer.from(getDisplayStartScript()),
          },
          {
            path: `${SERVICE_DIR}/cli-display-start.sh`,
            content: Buffer.from(getCliDisplayStartScript()),
          },
          {
            path: `${SERVICE_DIR}/sandbox-bridge.py`,
            content: Buffer.from(getSandboxBridgeScript()),
          },
        ]);
        await Promise.all([
          sandbox.runCommand({
            cmd: "npm",
            args: ["install", "ws"],
            cwd: SERVICE_DIR,
          }),
          sandbox.runCommand({
            cmd: "chmod",
            args: [
              "+x",
              `${SERVICE_DIR}/display-start.sh`,
              `${SERVICE_DIR}/cli-display-start.sh`,
              `${SERVICE_DIR}/sandbox-bridge.py`,
            ],
          }),
        ]);
      },
      async xdgDesktop() {
        await sandbox.writeFiles([
          {
            path: `${HOME}/WELCOME.md`,
            content: Buffer.from(
              [
                "# Welcome to vdesk (CLI)",
                "",
                "This workspace is configured as CLI-only.",
                "Use the Terminal app to work inside the VM.",
                "",
              ].join("\n"),
            ),
          },
        ]);
      },
    });
  } else {
    await all({
    // Download Xpra RPMs (fast, ~10s — kicks off immediately)
    async xpraDownload() {
      return runStep(
        "Download Xpra RPMs",
        [
          `curl -fsSL -o /tmp/xpra-common.rpm "${XPRA_LTS}/xpra-common-5.1.4-10.r0.el9.x86_64.rpm"`,
          `curl -fsSL -o /tmp/xpra-server.rpm "${XPRA_LTS}/xpra-server-5.1.4-10.r0.el9.x86_64.rpm"`,
          `curl -fsSL -o /tmp/xpra-x11.rpm "${XPRA_LTS}/xpra-x11-5.1.4-10.r0.el9.x86_64.rpm"`,
          `curl -fsSL -o /tmp/xpra-html5.rpm "${XPRA_STABLE}/xpra-html5-19-1.r1.el9.noarch.rpm"`,
        ].join(" & ") + " & wait",
      );
    },

    // Big dnf install — the bottleneck (~3-8 min)
    async dnfPackages() {
      return runStep(
        "SPAL repo + system tools + X11/GTK4 deps + desktop apps",
        [
          "sudo dnf install -y spal-release",
            "sudo dnf install -y vim-enhanced wget jq tree tmux cpio gcc gcc-c++ make" +
            " xorg-x11-server-Xvfb xorg-x11-server-Xorg xorg-x11-drv-dummy mesa-dri-drivers dbus-x11 xdg-utils git python3-pip xterm xorg-x11-fonts-misc xorg-x11-fonts-Type1 xorg-x11-fonts-100dpi" +
            " cargo rust" +
            " mesa-libEGL mesa-libGLES mesa-libgbm libglvnd-egl libglvnd-gles" +
            " gstreamer1 gstreamer1-plugins-base gstreamer1-plugins-good" +
            " firefox nautilus gnome-calculator gnome-text-editor" +
            " libnotify python3-dbus python3-pyxdg python3-gobject" +
            " xdpyinfo" +
            " google-noto-sans-fonts google-noto-emoji-fonts dejavu-fonts-all adwaita-icon-theme",
          "sudo ln -sf /usr/bin/vim /usr/local/bin/vi",
        ].join(" && "),
      );
    },

    async displayPrereqs() {
      await this.$.dnfPackages;
      return runStep(
        "Display stack prerequisites (noVNC/VNC/Kasm fallback/RDP)",
        displayDepsScript,
      );
    },

    // Install Xpra RPMs — needs both dnf lock free AND downloads done
    async xpraInstall() {
      await this.$.dnfPackages;
      await this.$.xpraDownload;
      return runStep(
        "Install Xpra RPMs",
        "sudo dnf install -y /tmp/xpra-common.rpm /tmp/xpra-server.rpm /tmp/xpra-x11.rpm /tmp/xpra-html5.rpm",
      );
    },

    // System config files — needs dnf for Xpra dirs, GTK, etc.
    async sysConfig() {
      await this.$.dnfPackages;
      return runStep("System config files", sysConfigScript);
    },
    async cargoPath() {
      await this.$.dnfPackages;
      return runStep("Configure Cargo PATH", cargoPathScript);
    },

    // Firefox profile setup — needs firefox binary from dnf
    async firefoxProfile() {
      await this.$.dnfPackages;
      return runStep("Firefox profile", firefoxProfileScript);
    },

    // Install code-server binary (independent of dnf)
    async codeServer() {
      return runStep(
        "code-server",
        "curl -fsSL https://code-server.dev/install.sh | sh",
      );
    },

    // Theme + extensions — needs code-server binary
    async codeServerExtensions() {
      await this.$.codeServer;

      await log("Writing code-server theme + settings...");
      const csFiles = getCodeServerFiles(HOME);
      await sandbox.writeFiles(
        csFiles.map((f) => ({
          path: f.path,
          content: Buffer.from(f.content),
        })),
      );
      await log("code-server theme + settings done");

      const extensions = [
        "dbaeumer.vscode-eslint", // ESLint
        "esbenp.prettier-vscode", // Prettier
        "bradlc.vscode-tailwindcss", // Tailwind CSS IntelliSense
        "Vue.volar", // Vue (Official) -- also powers Nuxt
        "astro-build.astro-vscode", // Astro
        "biomejs.biome", // Biome (linter/formatter)
      ];
      await log(`Installing ${extensions.length} code-server extensions...`);
      await sandbox.runCommand({
        cmd: "bash",
        args: [
          "-c",
          extensions
            .map((ext) => `code-server --install-extension ${ext}`)
            .join(" & ") + " & wait",
        ],
      });
      await log("code-server extensions done");
    },

    // npm globals: pm2, Claude Code, OpenCode, Bun (independent of dnf)
    async npmGlobals() {
      await this.$.cargoPath;
      return runStep(
        "pm2 + Bun + pnpm",
        [
          "npm install -g pm2",
          "curl -fsSL https://bun.sh/install | bash || true",
          "corepack enable && corepack prepare pnpm@latest --activate || true",
        ].join(" && "),
      );
    },

    // Service files + deps — needs pm2 from npmGlobals
    async serviceFiles() {
      await this.$.npmGlobals;

      await sandbox.runCommand({
        cmd: "bash",
        args: [
          "-c",
          `sudo mkdir -p ${SERVICE_DIR} && sudo chown $(whoami) ${SERVICE_DIR}`,
        ],
      });
      await sandbox.writeFiles([
        {
          path: `${SERVICE_DIR}/service.js`,
          content: Buffer.from(getServiceCode()),
        },
        {
          path: `${SERVICE_DIR}/package.json`,
          content: Buffer.from('{"name":"vdesk-services","private":true}'),
        },
        {
          path: `${SERVICE_DIR}/ecosystem.config.js`,
          content: Buffer.from(getEcosystemConfig()),
        },
        {
          path: `${SERVICE_DIR}/display-start.sh`,
          content: Buffer.from(getDisplayStartScript()),
        },
        {
          path: `${SERVICE_DIR}/cli-display-start.sh`,
          content: Buffer.from(getCliDisplayStartScript()),
        },
        {
          path: `${SERVICE_DIR}/xpra-start.sh`,
          content: Buffer.from(getXpraStartScript()),
        },
        {
          path: `${SERVICE_DIR}/novnc-start.sh`,
          content: Buffer.from(getNoVncStartScript()),
        },
        {
          path: `${SERVICE_DIR}/vnc-start.sh`,
          content: Buffer.from(getVncStartScript()),
        },
        {
          path: `${SERVICE_DIR}/kasmvnc-start.sh`,
          content: Buffer.from(getKasmVncStartScript()),
        },
        {
          path: `${SERVICE_DIR}/rdp-start.sh`,
          content: Buffer.from(getRdpStartScript()),
        },
        {
          path: `${SERVICE_DIR}/webrtc-start.sh`,
          content: Buffer.from(getWebRtcStartScript()),
        },
        {
          path: `${SERVICE_DIR}/sandbox-bridge.py`,
          content: Buffer.from(getSandboxBridgeScript()),
        },
      ]);
      await Promise.all([
        sandbox.runCommand({
          cmd: "npm",
          args: ["install", "ws"],
          cwd: SERVICE_DIR,
        }),
        sandbox.runCommand({
          cmd: "chmod",
          args: [
            "+x",
            `${SERVICE_DIR}/display-start.sh`,
            `${SERVICE_DIR}/cli-display-start.sh`,
            `${SERVICE_DIR}/xpra-start.sh`,
            `${SERVICE_DIR}/novnc-start.sh`,
            `${SERVICE_DIR}/vnc-start.sh`,
            `${SERVICE_DIR}/kasmvnc-start.sh`,
            `${SERVICE_DIR}/rdp-start.sh`,
            `${SERVICE_DIR}/webrtc-start.sh`,
          ],
        }),
        sandbox.runCommand({
          cmd: "chmod",
          args: ["+x", `${SERVICE_DIR}/sandbox-bridge.py`],
        }),
      ]);
    },

    // XDG dirs + desktop shortcuts (no deps, just SDK writes)
    async xdgDesktop() {
      await log("Setting up XDG user directories + desktop shortcuts...");
      await sandbox.writeFiles([
        {
          path: `${HOME}/WELCOME.md`,
          content: Buffer.from(
            [
              "# Welcome to vdesk",
              "",
              "You're running a full Linux desktop in the cloud, streamed to your browser.",
              "",
              "Everything you see — windows, taskbar, app launcher — is a web app. But the",
              "apps inside (Firefox, Text Editor) are real",
              "native Linux programs, running on a real Linux kernel.",
              "",
              "## Quick start",
              "",
              "- **Cmd+K** (or Ctrl+K) to open the app launcher",
              "- **Terminal** for a shell (ghostty-web, also streaming from the VM)",
              "- **Code** for VS Code (code-server)",
              "- **Files** to browse the filesystem",
              "- Drag windows to screen edges to snap/tile them",
              "",
              "## Architecture",
              "",
              "```",
              "Browser (React)  <--WebSocket-->  Vercel (Next.js)  <--SDK-->  Firecracker microVM",
              "  Canvas rendering                   API proxy                   Xpra + X11 apps",
              "  Window manager                     Auth & DB                   code-server",
              "  Taskbar & launcher                 Sandbox SDK                 PTY (terminal)",
              "```",
              "",
              "Happy hacking!",
              "",
            ].join("\n"),
          ),
        },
        {
          path: `${HOME}/.config/user-dirs.dirs`,
          content: Buffer.from(
            [
              'XDG_DESKTOP_DIR="$HOME/Desktop"',
              'XDG_DOCUMENTS_DIR="$HOME/Documents"',
              'XDG_DOWNLOAD_DIR="$HOME/Downloads"',
              'XDG_MUSIC_DIR="$HOME/Music"',
              'XDG_PICTURES_DIR="$HOME/Pictures"',
              'XDG_VIDEOS_DIR="$HOME/Videos"',
              'XDG_TEMPLATES_DIR="$HOME/Templates"',
              'XDG_PUBLICSHARE_DIR="$HOME/Public"',
            ].join("\n") + "\n",
          ),
        },
        {
          path: `${HOME}/.config/user-dirs.locale`,
          content: Buffer.from("en_US\n"),
        },
        {
          path: `${HOME}/Desktop/files.desktop`,
          content: Buffer.from(
            [
              "[Desktop Entry]",
              "Name=Files",
              "Comment=Browse files",
              "Exec=nautilus",
              "Icon=org.gnome.Nautilus",
              "Type=Application",
              "Categories=Utility;FileManager;",
            ].join("\n") + "\n",
          ),
        },
        {
          path: `${HOME}/Desktop/firefox.desktop`,
          content: Buffer.from(
            [
              "[Desktop Entry]",
              "Name=Firefox",
              "Comment=Web browser",
              "Exec=firefox",
              "Icon=firefox",
              "Type=Application",
              "Categories=Network;WebBrowser;",
            ].join("\n") + "\n",
          ),
        },
        {
          path: `${HOME}/Desktop/calculator.desktop`,
          content: Buffer.from(
            [
              "[Desktop Entry]",
              "Name=Calculator",
              "Comment=GNOME Calculator",
              "Exec=gnome-calculator",
              "Icon=org.gnome.Calculator",
              "Type=Application",
              "Categories=Utility;",
            ].join("\n") + "\n",
          ),
        },
        {
          path: `${HOME}/Desktop/text-editor.desktop`,
          content: Buffer.from(
            [
              "[Desktop Entry]",
              "Name=Text Editor",
              "Comment=GNOME Text Editor",
              "Exec=gnome-text-editor",
              "Icon=org.gnome.TextEditor",
              "Type=Application",
              "Categories=Utility;TextEditor;",
            ].join("\n") + "\n",
          ),
        },
      ]);
      await sandbox.runCommand({
        cmd: "bash",
        args: [
          "-c",
          "mkdir -p ~/Documents ~/Downloads ~/Music ~/Pictures ~/Videos ~/Templates ~/Public",
        ],
      });
      await log("XDG user directories + desktop shortcuts done");
    },

    // Custom install script (optional, no deps)
    async customScript() {
      if (!installScript) return;
      await log("Running custom install script");
      await sandbox.writeFiles([
        {
          path: `${HOME}/setup-custom.sh`,
          content: Buffer.from(installScript),
        },
      ]);
      const result = await sandbox.runCommand({
        cmd: "bash",
        args: [`${HOME}/setup-custom.sh`],
      });
      if (result.exitCode !== 0) {
        const stderr = await result.stderr();
        console.error(`[${prefix}] Custom install script failed:`, stderr);
        await onLog?.(`[${prefix}] Custom install script failed: ${stderr}`);
      } else {
        await log("Custom install script done");
      }
    },
    });
  }

  await log("All setup steps completed, creating snapshot...");
  const snapshot = await sandbox.snapshot();
  if (persistAsPlatformDefault) {
    await setGoldenSnapshotId(snapshot.snapshotId, experience);
  }

  await log(`Created new golden snapshot: ${snapshot.snapshotId}`);

  return {
    snapshotId: snapshot.snapshotId,
    status: snapshot.status,
    sizeBytes: snapshot.sizeBytes,
    createdAt: snapshot.createdAt.toISOString(),
    expiresAt: snapshot.expiresAt.toISOString(),
  };
}
