import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { PAGE_SIZES, type PageSizeId } from "./pagination/pageSizes";
import type { PagewiseSettings, PropertiesMode, ToggleScope } from "./settings";

/** What the settings tab needs from its owner: current values and a way to change them. */
export interface SettingsHost extends Plugin {
  readonly settings: PagewiseSettings;
  updateSettings(patch: Partial<PagewiseSettings>): Promise<void>;
}

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
  }
}
