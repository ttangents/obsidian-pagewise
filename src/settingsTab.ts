import { App, FuzzySuggestModal, getIcon, Plugin, PluginSettingTab, Setting, setIcon } from "obsidian";
import type { PaletteCommand } from "./obsidianInternals";
import { PAGE_SIZES, type PageSizeId } from "./pagination/pageSizes";
import { MAX_COMMAND_BUTTONS, type CommandButton, type PagewiseSettings, type PropertiesMode, type ToggleScope, type ToolbarScope } from "./settings";
import { BUILT_IN_CONTROLS } from "./toolbar/noteToolbar";

/** What the settings tab needs from its owner: current values, a way to change them, and the toolbar's catalog. */
export interface SettingsHost extends Plugin {
  readonly settings: PagewiseSettings;
  updateSettings(patch: Partial<PagewiseSettings>): Promise<void>;
  listCommands(): PaletteCommand[];
  commandName(commandId: string): string | null;
  extensionItems(): { id: string; label: string }[];
}

/** The icon a new command button gets when its command names none. */
const DEFAULT_COMMAND_ICON = "terminal-square";

export class PagewiseSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: SettingsHost
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Toggle scope")
      .setDesc(
        "This note only: pagination applies to the focused note and resets when it is closed or replaced. All notes: pagination applies everywhere at once and survives restarts."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("note", "This note only (resets on close)")
          .addOption("global", "All notes (persistent)")
          .setValue(this.plugin.settings.scope)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ scope: value as ToggleScope });
          })
      );

    new Setting(containerEl)
      .setName("Page size")
      .setDesc("Sheet dimensions used for the paginated view.")
      .addDropdown((dropdown) => {
        PAGE_SIZES.forEach((size) => dropdown.addOption(size.id, size.label));
        dropdown.setValue(this.plugin.settings.pageSize).onChange(async (value) => {
          await this.plugin.updateSettings({ pageSize: value as PageSizeId });
        });
      });

    new Setting(containerEl)
      .setName("Margins (mm)")
      .setDesc("Applied to all four sides of the on-screen sheet. 25.4 mm matches the Word default of one inch.")
      .addSlider((slider) =>
        slider
          .setLimits(10, 40, 1)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.marginMm)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ marginMm: value });
          })
      );

    new Setting(containerEl)
      .setName("Properties in paginated view")
      .setDesc(
        "Move to sidebar: the panel leaves the page; open it on demand with the toolbar’s Properties button or Obsidian’s own Properties view. Collapse in place: the panel stays on the page, folded. Leave unchanged: no intervention. The note's frontmatter is never modified."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("sidebar", "Move to sidebar")
          .addOption("collapse", "Collapse in place")
          .addOption("none", "Leave unchanged")
          .setValue(this.plugin.settings.propertiesMode)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ propertiesMode: value as PropertiesMode });
          })
      );

    new Setting(containerEl).setName("Gap between sheets (px)").addSlider((slider) =>
      slider
        .setLimits(0, 64, 4)
        .setDynamicTooltip()
        .setValue(this.plugin.settings.gapPx)
        .onChange(async (value) => {
          await this.plugin.updateSettings({ gapPx: value });
        })
    );

    this.displayToolbar(containerEl);
  }

  /** The toolbar section: where it shows, which controls it holds, and command buttons. */
  private displayToolbar(containerEl: HTMLElement): void {
    const { settings } = this.plugin;
    new Setting(containerEl).setName("Toolbar").setHeading();

    new Setting(containerEl)
      .setName("Show the toolbar on")
      .setDesc("The formatting toolbar at the top of a note.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("paginated", "Paginated notes only")
          .addOption("all", "All notes")
          .setValue(settings.toolbarScope)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ toolbarScope: value as ToolbarScope });
          })
      );

    new Setting(containerEl).setName("Built-in controls").setDesc("Turn off a control to remove it from the toolbar.").setHeading();
    BUILT_IN_CONTROLS.forEach(({ id, label }) => this.visibilityToggle(containerEl, id, label));

    new Setting(containerEl)
      .setName("Command buttons")
      .setDesc("Add any command from the command palette as a toolbar button. Icon names come from lucide.dev.")
      .setHeading();
    settings.commandButtons.forEach((button, index) => this.commandButtonRow(containerEl, button, index));
    new Setting(containerEl).addButton((button) =>
      button
        .setButtonText("Add command button")
        .setDisabled(settings.commandButtons.length >= MAX_COMMAND_BUTTONS)
        .onClick(() => new CommandPicker(this.app, this.plugin, (command) => void this.addCommandButton(command)).open())
    );

    new Setting(containerEl).setName("Added by other plugins").setHeading();
    const extensions = this.plugin.extensionItems();
    if (extensions.length === 0) {
      new Setting(containerEl).setDesc("No other plugin has added a toolbar button.");
    }
    extensions.forEach(({ id, label }) => this.visibilityToggle(containerEl, id, label, id));
  }

  /** A shown/hidden toggle for one built-in or extension control. */
  private visibilityToggle(containerEl: HTMLElement, id: string, label: string, description?: string): void {
    const setting = new Setting(containerEl).setName(label);
    if (description) setting.setDesc(description);
    setting.addToggle((toggle) =>
      toggle.setValue(!this.plugin.settings.hiddenControls.includes(id)).onChange(async (shown) => {
        const hidden = this.plugin.settings.hiddenControls.filter((other) => other !== id);
        await this.plugin.updateSettings({ hiddenControls: shown ? hidden : [...hidden, id] });
      })
    );
  }

  /** One command button: its name, its icon (with a preview), and move and remove controls. */
  private commandButtonRow(containerEl: HTMLElement, button: CommandButton, index: number): void {
    const buttons = this.plugin.settings.commandButtons;
    const name = this.plugin.commandName(button.commandId);
    const setting = new Setting(containerEl)
      .setName(name ?? "Missing command")
      .setDesc(name ? "" : `${button.commandId}: the plugin that provides it is turned off or removed. The button returns with it.`);
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
        .onChange(async (value) => {
          const icon = value.trim();
          showIcon(icon);
          if (!getIcon(icon)) return;
          await this.saveButtons(buttons.map((other, i) => (i === index ? { ...other, icon } : other)), false);
        })
    );
    const move = (offset: number) => {
      const next = [...buttons];
      const [moved] = next.splice(index, 1);
      next.splice(index + offset, 0, moved);
      void this.saveButtons(next, true);
    };
    setting.addExtraButton((extra) =>
      extra.setIcon("arrow-up").setTooltip("Move earlier on the toolbar").setDisabled(index === 0).onClick(() => move(-1))
    );
    setting.addExtraButton((extra) =>
      extra.setIcon("arrow-down").setTooltip("Move later on the toolbar").setDisabled(index === buttons.length - 1).onClick(() => move(1))
    );
    setting.addExtraButton((extra) =>
      extra
        .setIcon("trash-2")
        .setTooltip("Remove")
        .onClick(() => void this.saveButtons(buttons.filter((_, i) => i !== index), true))
    );
  }

  private async addCommandButton(command: PaletteCommand): Promise<void> {
    const buttons = this.plugin.settings.commandButtons.filter((button) => button.commandId !== command.id);
    const icon = command.icon && getIcon(command.icon) ? command.icon : DEFAULT_COMMAND_ICON;
    await this.saveButtons([...buttons, { commandId: command.id, icon }], true);
  }

  /** Saves the command buttons; `redraw` rebuilds this tab, which typing in an icon field must not do. */
  private async saveButtons(commandButtons: CommandButton[], redraw: boolean): Promise<void> {
    await this.plugin.updateSettings({ commandButtons });
    if (redraw) this.display();
  }
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
