import { App, FuzzySuggestModal, getIcon, PluginSettingTab, setIcon, type Plugin, type Setting, type SettingDefinitionItem } from "obsidian";
import type { PaletteCommand } from "./obsidianInternals";
import { PAGE_SIZES } from "./pagination/pageSizes";
import { MAX_COMMAND_BUTTONS, normalizeSettings, type CommandButton, type PagewiseSettings } from "./settings";

/** What the settings tab needs from its owner: current values, a way to change them, and the toolbar's catalog. */
export interface SettingsHost {
  readonly settings: PagewiseSettings;
  updateSettings(patch: Partial<PagewiseSettings>): Promise<void>;
  listCommands(): PaletteCommand[];
  commandName(commandId: string): string | null;
  extensionItems(): { id: string; label: string }[];
  /** The toolbar's built-in controls, in bar order. */
  builtInControls(): readonly { id: string; label: string }[];
}

/** The icon a new command button gets when its command names none. */
const DEFAULT_COMMAND_ICON = "terminal-square";

/** Settings a control binds to directly. The lists have rows of their own. */
const SCALAR_KEYS = ["scope", "pageSize", "marginMm", "gapPx", "propertiesMode", "calloutStyle", "toolbarScope"] as const;
type ScalarKey = (typeof SCALAR_KEYS)[number];

/** A toolbar control's visibility toggle binds to this virtual key; true means shown. */
const SHOWN_PREFIX = "shown:";

/**
 * The settings tab, declared through Obsidian's settings definitions, so Obsidian
 * draws every row in its own style and lists each setting in its settings search.
 * Every read and write goes through `getControlValue` and `setControlValue`, and
 * every list handler reads the current settings, never a copy taken at render time.
 */
export class PagewiseSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly host: SettingsHost
  ) {
    super(app, plugin);
  }

  getControlValue(key: string): unknown {
    const { settings } = this.host;
    if (key.startsWith(SHOWN_PREFIX)) return !settings.hiddenControls.includes(key.slice(SHOWN_PREFIX.length));
    return isScalarKey(key) ? settings[key] : undefined;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const { settings } = this.host;
    if (key.startsWith(SHOWN_PREFIX)) {
      const id = key.slice(SHOWN_PREFIX.length);
      const hidden = settings.hiddenControls.filter((other) => other !== id);
      await this.host.updateSettings({ hiddenControls: value === false ? [...hidden, id] : hidden });
      return;
    }
    if (!isScalarKey(key)) return;
    const patch: Partial<PagewiseSettings> = { [key]: value };
    // normalizeSettings replaces a value outside the allowed set; such a value is refused here instead.
    if (normalizeSettings({ ...settings, ...patch })[key] !== value) return;
    await this.host.updateSettings(patch);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [...this.pageDefinitions(), this.toolbarGroup(), this.builtInGroup(), this.commandList(), this.extensionList()];
  }

  private pageDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: "Toggle scope",
        desc: "This note only: pagination applies to the focused note and resets when it is closed or replaced. All notes: pagination applies everywhere at once and survives restarts.",
        control: {
          type: "dropdown",
          key: "scope",
          options: { note: "This note only (resets on close)", global: "All notes (persistent)" },
        },
      },
      {
        name: "Page size",
        desc: "Sheet dimensions used for the paginated view.",
        control: { type: "dropdown", key: "pageSize", options: Object.fromEntries(PAGE_SIZES.map((size) => [size.id, size.label])) },
      },
      {
        name: "Margins (mm)",
        desc: "Applied to all four sides of the on-screen sheet. 25.4 mm matches the Word default of one inch.",
        control: { type: "slider", key: "marginMm", min: 10, max: 40, step: 1 },
      },
      {
        name: "Properties in paginated view",
        desc: "Move to sidebar: the panel leaves the page; open it on demand with the toolbar's properties button or Obsidian's own properties view. Collapse in place: the panel stays on the page, folded. Leave unchanged: no intervention. The note's frontmatter is never modified.",
        control: {
          type: "dropdown",
          key: "propertiesMode",
          options: { sidebar: "Move to sidebar", collapse: "Collapse in place", none: "Leave unchanged" },
        },
      },
      {
        name: "Callouts in paginated view",
        desc: "Pagewise cards: callouts sit on a card like the linked mentions, with the callout's colour on its icon; your theme still sets fonts and colours. Theme: callouts look as your theme draws them.",
        control: { type: "dropdown", key: "calloutStyle", options: { cards: "Pagewise cards", theme: "As the theme draws them" } },
      },
      {
        name: "Gap between sheets (px)",
        control: { type: "slider", key: "gapPx", min: 0, max: 64, step: 4 },
      },
    ];
  }

  private toolbarGroup(): SettingDefinitionItem {
    return {
      type: "group",
      heading: "Toolbar",
      items: [
        {
          name: "Show the toolbar on",
          desc: "The formatting toolbar at the top of a note.",
          control: { type: "dropdown", key: "toolbarScope", options: { paginated: "Paginated notes only", all: "All notes" } },
        },
      ],
    };
  }

  /** A shown/hidden toggle for each built-in control. */
  private builtInGroup(): SettingDefinitionItem {
    return {
      type: "group",
      heading: "Built-in controls",
      items: this.host.builtInControls().map(({ id, label }) => ({
        name: label,
        desc: "Turn off to remove this control from the toolbar.",
        control: { type: "toggle", key: `${SHOWN_PREFIX}${id}` },
      })),
    };
  }

  /**
   * One row per command button, in toolbar order. Obsidian draws each row's delete
   * button and drag handle; each row adds its icon field with a preview.
   */
  private commandList(): SettingDefinitionItem {
    const buttons = this.host.settings.commandButtons;
    return {
      type: "list",
      heading: "Command buttons",
      emptyState: "Add any command from the command palette as a toolbar button.",
      addItem:
        buttons.length < MAX_COMMAND_BUTTONS
          ? {
              name: "Add command button",
              action: () => new CommandPicker(this.app, this.host, (command) => void this.addCommandButton(command)).open(),
            }
          : undefined,
      onReorder: (from, to) => {
        const next = [...this.host.settings.commandButtons];
        const [moved] = next.splice(from, 1);
        if (moved) next.splice(to, 0, moved);
        void this.saveButtons(next, true);
      },
      onDelete: (index) => void this.saveButtons(this.host.settings.commandButtons.filter((_, i) => i !== index), true),
      items: buttons.map((button) => {
        const name = this.host.commandName(button.commandId);
        return {
          name: name ?? "Missing command",
          desc: name
            ? "Icon: a name from lucide.dev."
            : `${button.commandId}: the plugin that provides it is turned off or removed. The button returns with it.`,
          searchable: false,
          render: (setting: Setting) => this.iconField(setting, button),
        };
      }),
    };
  }

  /** The icon field of one command button, with a live preview. Typing never redraws the tab. */
  private iconField(setting: Setting, button: CommandButton): void {
    const preview = setting.controlEl.createSpan({ cls: "pagewise-settings-icon" });
    const showIcon = (icon: string) => {
      preview.empty();
      setIcon(preview, getIcon(icon) ? icon : "puzzle");
    };
    showIcon(button.icon);
    setting.addText((text) =>
      text
        .setPlaceholder(DEFAULT_COMMAND_ICON)
        .setValue(button.icon)
        .onChange((value) => {
          const icon = value.trim();
          showIcon(icon);
          if (!getIcon(icon)) return;
          const next = this.host.settings.commandButtons.map((other) => (other.commandId === button.commandId ? { ...other, icon } : other));
          void this.saveButtons(next, false);
        })
    );
  }

  /** A shown/hidden toggle for each item another plugin added. */
  private extensionList(): SettingDefinitionItem {
    return {
      type: "list",
      heading: "Added by other plugins",
      emptyState: "No other plugin has added a toolbar button.",
      items: this.host.extensionItems().map(({ id, label }) => ({
        name: label,
        desc: id,
        control: { type: "toggle", key: `${SHOWN_PREFIX}${id}` },
      })),
    };
  }

  private async addCommandButton(command: PaletteCommand): Promise<void> {
    const buttons = this.host.settings.commandButtons.filter((button) => button.commandId !== command.id);
    const icon = command.icon && getIcon(command.icon) ? command.icon : DEFAULT_COMMAND_ICON;
    await this.saveButtons([...buttons, { commandId: command.id, icon }], true);
  }

  /** Saves the command buttons; `redraw` rebuilds the rows, which typing in an icon field must not do. */
  private async saveButtons(commandButtons: CommandButton[], redraw: boolean): Promise<void> {
    await this.host.updateSettings({ commandButtons });
    if (redraw) this.update();
  }
}

function isScalarKey(key: string): key is ScalarKey {
  return (SCALAR_KEYS as readonly string[]).includes(key);
}

/** Picks a command from the command palette's list for a new toolbar button. */
class CommandPicker extends FuzzySuggestModal<PaletteCommand> {
  constructor(
    app: App,
    private readonly host: SettingsHost,
    private readonly onChoose: (command: PaletteCommand) => void
  ) {
    super(app);
    this.setPlaceholder("Choose a command for the toolbar");
  }

  getItems(): PaletteCommand[] {
    return this.host.listCommands();
  }

  getItemText(command: PaletteCommand): string {
    return command.name;
  }

  onChooseItem(command: PaletteCommand): void {
    this.onChoose(command);
  }
}
