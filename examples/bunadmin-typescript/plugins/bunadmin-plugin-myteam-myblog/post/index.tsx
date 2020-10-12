import React, { createRef } from "react"
import { useTheme } from "@material-ui/core/styles"
import {
  Table,
  TableHead,
  tableIcons,
  TableDefaultProps as DefaultProps,
  useTranslation,
  notice
} from "@bunred/bunadmin"
import { SchemaLabel, SchemaColumns } from "./plugin"
import Type from "./types"

export default function Post() {
  const { t } = useTranslation("table")
  const theme = useTheme()
  const tableRef = createRef()

  return (
    <>
      <TableHead title={t(SchemaLabel)} />
      <Table
        tableRef={tableRef}
        title={t(SchemaLabel)}
        columns={SchemaColumns()}
        style={DefaultProps.style}
        icons={tableIcons({ theme })}
        options={{
          ...DefaultProps.options,
          filtering: true
        }}
        data={[
          {
            id: 1,
            name: "post 1",
            content: "content 1"
          },
          {
            id: 2,
            name: "post 2",
            content: "content 2"
          }
        ]}
        editable={{
          onRowAdd: async (newData: Type) =>
            await notice({
              title: "test create",
              content: newData
            }),
          onRowUpdate: async (newData: Type, oldData: Type) =>
            await notice({
              title: "test update",
              content: { newData, oldData }
            }),
          onBulkUpdate: async (changes: any) =>
            await notice({
              title: "test bulk update",
              content: changes
            }),
          onRowDelete: async (oldData: Type) =>
            await notice({
              title: "test delete",
              content: oldData
            })
        }}
        actions={[
          {
            tooltip: "Remove All Selected Rows",
            icon: "delete",
            onClick: async (_evt: any, data: Type[]) =>
              await notice({
                title: "test bulk delete",
                content: data
              })
          }
        ]}
      />
    </>
  )
}
