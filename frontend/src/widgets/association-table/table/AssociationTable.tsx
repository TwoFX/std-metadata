"use client";

import "react-data-grid/lib/styles.css";
import {
  Column,
  DataGrid,
  RenderRowProps,
  SelectColumn,
} from "react-data-grid";
import { JSX, useCallback, useContext, useState } from "react";
import { DraggableRowRenderer } from "./DraggableRowRenderer";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { v4 as uuidv4 } from "uuid";
import {
  AssociationTableCell,
  AssociationTableCellOption,
  AssociationTableColumnDescription,
  AssociationTableFactCellState,
  AssociationTableRow,
} from "@/lib/transfer/project";
import { GroveContext } from "@/lib/transfer/context";
import { GroveContextData } from "@/lib/transfer/contextdata";
import {
  declarationDisplayShort,
  declarationName,
  declarationStateRepr,
} from "@/lib/transfer/util";
import { produce } from "immer";
import { AssociationTableFactComponent } from "../AssociationTableFactComponent";
import { Templates } from "@/lib/templates";
import { GroveTemplateContext } from "@/lib/templates/context";

function rowKeyGetter(row: AssociationTableRow) {
  return row.uuid;
}

function columnDescriptionFor(
  columnDescriptions: AssociationTableColumnDescription[],
  columnIdentifier: string,
): AssociationTableColumnDescription | undefined {
  // TODO: performance
  return columnDescriptions.find(
    (descr) => descr.identifier === columnIdentifier,
  );
}

function optionFor(
  context: GroveContextData,
  columnDescription: AssociationTableColumnDescription,
  cellValue: string,
): AssociationTableCellOption | undefined {
  // TODO: performance
  return columnDescription.options.find(
    (opt) => optionKey(context, opt) === cellValue,
  );
}

function optionKey(
  context: GroveContextData,
  opt: AssociationTableCellOption,
): string {
  switch (opt.constructor) {
    case "declaration":
      return declarationName(context.declarations[opt.declaration]);
    case "other":
      return opt.other.value;
  }
}

function optionDisplayShort(
  context: GroveContextData,
  opt: AssociationTableCellOption,
): string {
  switch (opt.constructor) {
    case "declaration":
      return declarationDisplayShort(context.declarations[opt.declaration]);
    case "other":
      return opt.other.shortDescription;
  }
}

function optionStateRepr(
  context: GroveContextData,
  templates: Templates,
  opt: AssociationTableCellOption,
): string {
  switch (opt.constructor) {
    case "declaration":
      return declarationStateRepr(
        templates,
        context.declarations[opt.declaration],
      );
    case "other":
      return opt.other.stateRepr;
  }
}

function cellFor(
  row: AssociationTableRow,
  columnIdent: string,
): AssociationTableCell | undefined {
  // TODO: performance
  return row.columns.find((col) => col.columnIdentifier === columnIdent);
}

function rowFactState(
  context: GroveContextData,
  templates: Templates,
  columnDefinitions: AssociationTableColumnDescription[],
  row: AssociationTableRow,
): AssociationTableFactCellState[] {
  return row.columns.flatMap((cell) => {
    const columnDescription = columnDescriptionFor(
      columnDefinitions,
      cell.columnIdentifier,
    );
    if (!columnDescription) {
      return [];
    }
    const option = optionFor(context, columnDescription, cell.cellValue);
    if (!option) {
      return [];
    }
    return [
      {
        cellValue: cell.cellValue,
        columnIdentifier: cell.columnIdentifier,
        stateRepr: optionStateRepr(context, templates, option),
      },
    ];
  });
}

function updateRow(
  row: AssociationTableRow,
  columnIdent: string,
  newValue: string,
): AssociationTableRow {
  // TODO: performance
  const result = produce(row, (draft) => {
    let found = false;
    for (const col of draft.columns) {
      if (col.columnIdentifier === columnIdent) {
        col.cellValue = newValue;
        found = true;
      }
    }
    if (!found) {
      draft.columns.push({
        columnIdentifier: columnIdent,
        cellValue: newValue,
      });
    }
  });
  return result;
}

export function AssociationTable({
  widgetId,
  columnDefinitions,
  tableRows,
  setTableRows,
}: {
  widgetId: string;
  columnDefinitions: AssociationTableColumnDescription[];
  tableRows: AssociationTableRow[];
  setTableRows: (rows: AssociationTableRow[]) => void;
}): JSX.Element {
  const context = useContext(GroveContext);
  const templates = useContext(GroveTemplateContext);
  const [selectedRows, setSelectedRows] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const columns: Column<AssociationTableRow>[] = [
    SelectColumn,
    ...columnDefinitions.map((columnDescription) => {
      return {
        key: columnDescription.identifier,
        name: columnDescription.shortDescription,
        renderCell: ({ row }: { row: AssociationTableRow }) => {
          const cell = cellFor(row, columnDescription.identifier);
          if (!cell) return null;
          const option = optionFor(context, columnDescription, cell.cellValue);
          return option ? optionDisplayShort(context, option) : cell.cellValue;
        },
        renderEditCell: ({
          row,
          onRowChange,
        }: {
          row: AssociationTableRow;
          onRowChange: (row: AssociationTableRow) => void;
        }) => (
          <select
            className="w-full p-2 border rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={cellFor(row, columnDescription.identifier)?.cellValue}
            onChange={(e) =>
              onRowChange(
                updateRow(row, columnDescription.identifier, e.target.value),
              )
            }
          >
            <option value=""></option>
            {columnDescription.options.map((option) => (
              <option
                key={optionKey(context, option)}
                value={optionKey(context, option)}
              >
                {optionDisplayShort(context, option)}
              </option>
            ))}
          </select>
        ),
      };
    }),
    {
      key: "__grove_fact_column",
      name: "Fact",
      editable: false,
      renderCell: ({ row }) => {
        return (
          <AssociationTableFactComponent
            widgetId={widgetId}
            rowId={row.uuid}
            factId={row.uuid}
            newState={() =>
              rowFactState(context, templates, columnDefinitions, row)
            }
          />
        );
      },
    },
  ];

  const renderRow = useCallback(
    (key: React.Key, props: RenderRowProps<AssociationTableRow>) => {
      function onRowReorder(fromIndex: number, toIndex: number) {
        const newRows = [...tableRows];
        newRows.splice(toIndex, 0, newRows.splice(fromIndex, 1)[0]);
        setTableRows(newRows);
      }

      return (
        <DraggableRowRenderer
          key={key}
          {...props}
          onRowReorder={onRowReorder}
        />
      );
    },
    [tableRows, setTableRows],
  );

  const addEmptyRow = () => {
    const emptyRow: AssociationTableRow = {
      uuid: uuidv4(),
      columns: [],
    };

    const newRows = [...tableRows, emptyRow];
    setTableRows(newRows);
  };

  const deleteSelectedRows = () => {
    const newRows = tableRows.filter((row) => !selectedRows.has(row.uuid));
    setTableRows(newRows);
  };

  const handleRowsChange = (rows: AssociationTableRow[]) => {
    setTableRows(rows);
  };

  const handleSelectionChange = (rows: ReadonlySet<string>) => {
    setSelectedRows(rows);
  };

  return (
    <div className="flex flex-col flex-grow">
      <div className="flex-grow">
        <DndProvider backend={HTML5Backend}>
          <DataGrid
            columns={columns}
            rows={tableRows}
            onRowsChange={handleRowsChange}
            renderers={{ renderRow }}
            selectedRows={selectedRows}
            onSelectedRowsChange={handleSelectionChange}
            rowKeyGetter={rowKeyGetter}
            className="h-full"
          />
        </DndProvider>
      </div>
      <div className="mt-2 space-x-2">
        <button
          onClick={addEmptyRow}
          className="mb-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Add Row
        </button>
        <button
          onClick={deleteSelectedRows}
          disabled={selectedRows.size === 0}
          className="mb-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Delete Selected Rows
        </button>
      </div>
    </div>
  );
}
