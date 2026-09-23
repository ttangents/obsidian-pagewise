import type { App, Editor, Menu } from "obsidian";
import { executeCommand } from "../obsidianInternals";
import { applyTableEdit, deleteTable, locateTable, type TableContext } from "../tables/tableEditor";
import {
  deleteColumn,
  deleteRow,
  duplicateRow,
  insertColumn,
  insertRow,
  moveColumn,
  moveRow,
  setAlignment,
  sortRows,
  transpose,
  type ColumnAlignment,
  type TableModel,
} from "../tables/tableModel";
import { addEntry, addHotkeyHint, addSubmenu, type MenuEntry } from "./menus";

/**
 * The table menu, built fresh on every open so it reflects where the cursor is:
 * everything but "New table" needs the cursor inside a table, and row operations
 * also need it on a body row rather than the header or delimiter line. Operations
 * rewrite the table's Markdown directly, because Obsidian keeps its own table
 * functions in the table widget's private context menu instead of in commands.
 */

type Transform = (model: TableModel, context: TableContext) => TableModel | null;
type RowTransform = (model: TableModel, bodyRow: number) => TableModel | null;

const NEW_TABLE_COMMAND = "editor:insert-table";
const TRASH: readonly string[] = ["trash-2", "trash"];

export function fillTableMenu(menu: Menu, app: App, editor: Editor): void {
  const located = locateTable(editor);
  const noTable = located === null;
  const noBodyRow = located?.context.bodyRow == null;

  const edit = (transform: Transform) => () => applyTableEdit(editor, transform);
  /** A transform that needs a body row; a no-op on the header or delimiter line. */
  const rowEdit = (transform: RowTransform) =>
    edit((model, ctx) => (ctx.bodyRow === null ? null : transform(model, ctx.bodyRow)));
  const align = (title: string, icon: string, alignment: ColumnAlignment): MenuEntry => ({
    title,
    icon: [icon],
    action: edit((model, ctx) => setAlignment(model, ctx.column, ctx.columnEnd, alignment)),
  });

  const newTable = addEntry(menu, {
    title: "New table",
    icon: ["table", "grid-3x3"],
    action: () => executeCommand(app, NEW_TABLE_COMMAND),
  });
  addHotkeyHint(app, newTable, NEW_TABLE_COMMAND);
  menu.addSeparator();

  addSubmenu(
    menu,
    "Align column",
    ["align-center", "align-left"],
    [align("Left", "align-left", "left"), align("Center", "align-center", "center"), align("Right", "align-right", "right")],
    noTable
  );
  addSubmenu(
    menu,
    "Insert",
    ["plus"],
    [
      {
        title: "Row above",
        icon: ["arrow-up-to-line", "arrow-up"],
        action: edit((model, ctx) => insertRow(model, ctx.bodyRow ?? 0)),
      },
      {
        title: "Row below",
        icon: ["arrow-down-to-line", "arrow-down"],
        action: edit((model, ctx) => insertRow(model, ctx.bodyRow === null ? 0 : ctx.bodyRow + 1)),
      },
      {
        title: "Column left",
        icon: ["arrow-left-to-line", "arrow-left"],
        action: edit((model, ctx) => insertColumn(model, ctx.column)),
      },
      {
        title: "Column right",
        icon: ["arrow-right-to-line", "arrow-right"],
        action: edit((model, ctx) => insertColumn(model, ctx.column + 1)),
      },
    ],
    noTable
  );
  addSubmenu(
    menu,
    "Move",
    ["move", "move-3d"],
    [
      {
        title: "Row up",
        icon: ["move-up", "arrow-up"],
        action: rowEdit((model, row) => moveRow(model, row, -1)),
        disabled: noBodyRow,
      },
      {
        title: "Row down",
        icon: ["move-down", "arrow-down"],
        action: rowEdit((model, row) => moveRow(model, row, 1)),
        disabled: noBodyRow,
      },
      {
        title: "Column left",
        icon: ["move-left", "arrow-left"],
        action: edit((model, ctx) => moveColumn(model, ctx.column, -1)),
      },
      {
        title: "Column right",
        icon: ["move-right", "arrow-right"],
        action: edit((model, ctx) => moveColumn(model, ctx.column, 1)),
      },
    ],
    noTable
  );
  addSubmenu(
    menu,
    "Delete",
    TRASH,
    [
      { title: "Row", icon: TRASH, action: rowEdit(deleteRow), disabled: noBodyRow },
      { title: "Column", icon: TRASH, action: edit((model, ctx) => deleteColumn(model, ctx.column)) },
      { title: "Table", icon: TRASH, action: () => deleteTable(editor) },
    ],
    noTable
  );
  menu.addSeparator();

  addSubmenu(
    menu,
    "Sort rows",
    ["arrow-down-a-z", "sort-asc"],
    [
      {
        title: "A to Z",
        icon: ["arrow-down-a-z", "sort-asc"],
        action: edit((model, ctx) => sortRows(model, ctx.column, true)),
      },
      {
        title: "Z to A",
        icon: ["arrow-down-z-a", "sort-desc"],
        action: edit((model, ctx) => sortRows(model, ctx.column, false)),
      },
    ],
    noTable
  );
  addEntry(menu, {
    title: "Duplicate row",
    icon: ["copy-plus", "copy"],
    action: rowEdit(duplicateRow),
    disabled: noBodyRow,
  });
  addEntry(menu, {
    title: "Tidy table",
    icon: ["wand-sparkles", "wand-2", "wand"],
    action: edit((model) => model),
    disabled: noTable,
  });
  addEntry(menu, {
    title: "Transpose",
    icon: ["move-diagonal", "maximize-2"],
    action: edit(transpose),
    disabled: noTable,
  });
}
