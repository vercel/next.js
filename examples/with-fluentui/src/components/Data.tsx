import {
  PresenceBadgeStatus,
  Avatar,
  TableBody,
  TableCell,
  TableRow,
  Table,
  TableHeader,
  TableHeaderCell,
  TableSelectionCell,
  useTableFeatures,
  TableColumnDefinition,
  TableRowId,
  useTableSelection,
  TableCellLayout,
  createTableColumn,
} from '@fluentui/react-components'
import * as React from 'react'
import {
  FolderRegular,
  EditRegular,
  OpenRegular,
  DocumentRegular,
  PeopleRegular,
  DocumentPdfRegular,
  VideoRegular,
} from '@fluentui/react-icons'

type FileCell = {
  label: string
  icon: JSX.Element
}

type LastUpdatedCell = {
  label: string
  timestamp: number
}

type LastUpdateCell = {
  label: string
  icon: JSX.Element
}

type AuthorCell = {
  label: string
  status: PresenceBadgeStatus
}

type Item = {
  file: FileCell
  author: AuthorCell
  lastUpdated: LastUpdatedCell
  lastUpdate: LastUpdateCell
}

const items: Item[] = [
  {
    file: { label: 'Meeting notes', icon: <DocumentRegular /> },
    author: { label: 'Max Mustermann', status: 'available' },
    lastUpdated: { label: '7h ago', timestamp: 3 },
    lastUpdate: {
      label: 'You edited this',
      icon: <EditRegular />,
    },
  },
  {
    file: { label: 'Thursday presentation', icon: <FolderRegular /> },
    author: { label: 'Erika Mustermann', status: 'busy' },
    lastUpdated: { label: 'Yesterday at 1:45 PM', timestamp: 2 },
    lastUpdate: {
      label: 'You recently opened this',
      icon: <OpenRegular />,
    },
  },
  {
    file: { label: 'Training recording', icon: <VideoRegular /> },
    author: { label: 'John Doe', status: 'away' },
    lastUpdated: { label: 'Yesterday at 1:45 PM', timestamp: 2 },
    lastUpdate: {
      label: 'You recently opened this',
      icon: <OpenRegular />,
    },
  },
  {
    file: { label: 'Purchase order', icon: <DocumentPdfRegular /> },
    author: { label: 'Jane Doe', status: 'offline' },
    lastUpdated: { label: 'Tue at 9:30 AM', timestamp: 1 },
    lastUpdate: {
      label: 'You shared this in a Teams chat',
      icon: <PeopleRegular />,
    },
  },
]

const columns: TableColumnDefinition<Item>[] = [
  createTableColumn<Item>({
    columnId: 'file',
  }),
  createTableColumn<Item>({
    columnId: 'author',
  }),
  createTableColumn<Item>({
    columnId: 'lastUpdated',
  }),
  createTableColumn<Item>({
    columnId: 'lastUpdate',
  }),
]

export const Data = () => {
  const [selectedRows, setSelectedRows] = React.useState(
    () => new Set<TableRowId>([1])
  )

  const {
    getRows,
    selection: { toggleRow, isRowSelected },
  } = useTableFeatures(
    {
      columns,
      items,
    },
    [
      useTableSelection({
        selectionMode: 'single',
        selectedItems: selectedRows,
        onSelectionChange: (e, data) => setSelectedRows(data.selectedItems),
      }),
    ]
  )

  const rows = getRows((row) => {
    const selected = isRowSelected(row.rowId)
    return {
      ...row,
      onClick: (e: React.MouseEvent) => toggleRow(e, row.rowId),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === ' ') {
          e.preventDefault()
          toggleRow(e, row.rowId)
        }
      },
      selected,
      appearance: selected ? ('brand' as const) : ('none' as const),
    }
  })

  return (
    <Table aria-label="Table with controlled single selection">
      <TableHeader>
        <TableRow>
          <TableSelectionCell type="radio" hidden />
          <TableHeaderCell>File</TableHeaderCell>
          <TableHeaderCell>Author</TableHeaderCell>
          <TableHeaderCell>Last updated</TableHeaderCell>
          <TableHeaderCell>Last update</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ item, selected, onClick, onKeyDown, appearance }) => (
          <TableRow
            key={item.file.label}
            onClick={onClick}
            onKeyDown={onKeyDown}
            aria-selected={selected}
            appearance={appearance}
          >
            <TableSelectionCell
              checked={selected}
              type="radio"
              radioIndicator={{ 'aria-label': 'Select row' }}
            />
            <TableCell>
              <TableCellLayout media={item.file.icon}>
                {item.file.label}
              </TableCellLayout>
            </TableCell>
            <TableCell>
              <TableCellLayout
                media={
                  <Avatar
                    aria-label={item.author.label}
                    name={item.author.label}
                    badge={{ status: item.author.status }}
                  />
                }
              >
                {item.author.label}
              </TableCellLayout>
            </TableCell>
            <TableCell>{item.lastUpdated.label}</TableCell>
            <TableCell>
              <TableCellLayout media={item.lastUpdate.icon}>
                {item.lastUpdate.label}
              </TableCellLayout>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
