import { Cell, Grid, Row } from "@material/react-layout-grid";

import "@material/react-layout-grid/dist/layout-grid.css";

export const Layout = ({ children }) => <Grid>{children}</Grid>;

export const LayoutRow = ({ children }) => <Row>{children}</Row>;

export const LayoutCell = ({ children }) => <Cell columns={4}>{children}</Cell>;

export const LayoutFluidCell = ({ children }) => (
  <Cell columns={12}>{children}</Cell>
);

export default Layout;
