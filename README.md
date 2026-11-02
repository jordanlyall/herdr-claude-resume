# claude-resume

A [Herdr](https://herdr.dev) mod that brings your Claude Code chats back after you restart your Mac.

When you restart, Herdr restores your spaces and panes, but every pane comes back as a bare shell and your Claude chats are gone. claude-resume remembers which chat was running in which pane. The first time Herdr opens after a boot, it types `claude --resume <session>` into each of those panes. Chats come back idle, and nothing re-runs until you type.

![Before and after a restart](preview.png)

## Install

Ask the agent in your Herdr window:

> Add the Herdr mod at https://github.com/jordanlyall/herdr-claude-resume

It copies `mods/claude-resume/` into `~/.config/herdr-app/mods/`, adds the chip to your status bar, and registers the Claude Code hook in `~/.claude/settings.json`. [RECIPE.md](RECIPE.md) has the full details.

To make it fully automatic, add Herdr to System Settings → General → Login Items.

## What you'll see

A small chip in the status bar:

- `↻ 6 chats`: six chats would come back after a restart. Click it to resume any that are sitting at a bare shell right now.
- `↻ Resumed 5`: shown for 10 minutes after a restart. Hover to see which panes.
- `↻ set up`: the Claude Code hook isn't installed, so chats aren't being saved.

## What it touches

- A Claude Code hook (`hook.py`, on SessionStart and SessionEnd) writes one small file per pane to `~/.config/herdr-app/data/claude-resume/`. A chat you close on purpose (`/exit`, ctrl-D) is forgotten, so it won't come back.
- The mod runs `hc` and `sysctl`, and reads `~/.claude/settings.json` to check the hook is there.
- It never touches the network. Panes that are busy running something are never typed into.

Made for macOS. It also works on Windows with PowerShell 7: there the once-per-boot pass keys on the herdr-core start instead of the boot time, and the hook command is `python "C:/Users/<you>/.config/herdr-app/mods/claude-resume/hook.py"`.

## License

MIT
