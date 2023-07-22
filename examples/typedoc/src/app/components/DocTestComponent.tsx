/**
 * @packageDocumentation
 * @module Components
 */
import React, { FunctionComponent, MutableRefObject, ReactElement } from 'react'

/**
 * This interface is referencing the [[Test]] component props.
 * @category Component
 */
export interface TestProps {
  /**
   * The model constructor.
   */
  model: any
  /**
   * @deprecated This property will be removed in the next refactor.
   * The parent's model instance for the relational instances to check if current `instance` is a relational filed.
   */
  belongs?: any
  /**
   * Show card and table title.
   */
  showTitle?: boolean
  /**
   * By enabling this option, all user actions (like edit selected row data or adding new record) will be stored in URL query parameters and after that, all actions remain on the page after a refresh or reload the current URL in another browser tab.
   * All of these actions can interact with the browser's back and front keys and change the status of the current action by pressing these keys.
   *
   * Ex: `site.com/page/test?action:add`
   */
  saveActions?: boolean
  /**
   * The list component that is to be displayed on this page to present the list of available model's data to the user with the ability to edit and delete any row of the data list.
   *
   * Normally this component is [[DataGridTableEngine]]. But in some cases (such as displaying a simple list of options in a checkbox), the custom component can be assigned to it.
   *
   * > Note: If you intend to use a custom component,the props type and implementations must be similar to ‍[[DataGridTableEngine]] component ([[TestListComponentProps]]).
   */
  viewComponent?: FunctionComponent<object>
  /**
   * The custom props of the [[FormEngine]] component that used on edit and add new record.
   */
  formProps?: object
  /**
   * Used on custom [[Test]] components.
   * See [[Test]] descriptions to read more about creating custom components.
   */
  children?: (components: TestPropsChildrenArguments) => ReactElement
  /**
   * A callback function that calls after data list in reloaded.
   */
  onGetRecords?: () => Promise<any>
}

/**
 * This interface is referencing the [[Test]] component `children` arguments.
 * @category Component
 */
interface TestPropsChildrenArguments {
  /**
   * The data table list component.
   * Normally this component is [[DataGridTableEngine]]. But in some cases (such as displaying a simple list of options in a checkbox), the custom component can be assigned to it.
   */
  list: FunctionComponent<Partial<TestListComponentProps>>
  /**
   * The [[FormButton]] component to add new record.
   */
  addRecord: FunctionComponent<object>
}

/**
 * This interface is referencing the [[Test]] custom component props.
 * @category Component
 */
export interface TestCustomizerProps {
  /**
   * The model constructor.
   */
  model: any
  /**
   * An reference to the original [[Test]] with all default and passed props.
   */
  component: FunctionComponent<Partial<TestProps>>
}

/**
 * This interface is referencing the [[TestListComponentProps]] interface `callbacks` mutable ref.
 * @category Component
 */
export interface TestListComponentCallbacks {
  /**
   * A callback function that calls when user adds a new record to the data list or editing an existing record to reload the current data list.
   */
  getRecords?: () => Promise<any>
}

/**
 * This interface is referencing the [[Test]] component `viewComponent` property.
 * @category Component
 */
export interface TestListComponentProps {
  /**
   * The model constructor.
   */
  model: any
  /**
   * A callback to be called when the user wants to edit a row data.
   */
  onEdit?: (instance: any, rowIndex?: number) => void
  /**
   * A callback to be called when the user wants to delete a row.
   */
  onDelete?: (instance: any, rowIndex?: number) => void
  /**
   * A ref object to pass the [[TestListComponentCallbacks]] in [[Test]] component when you set a custom list component on [[Test]].
   */
  callbacks?: MutableRefObject<TestListComponentCallbacks>
}

/**
 * Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
 *
 * > Note: If you set the `dataGrid` component in the target model metadata (using ModelComponents decorator), this component will use it to render Test in it.
 *
 * See [[TestProps]] for more information.
 *
 * @category Component
 */
export const TestComponent: FunctionComponent<TestProps> = ({
  belongs,
  model,
  viewComponent,
  saveActions = true,
  showTitle = true,
  formProps,
  onGetRecords,
  children,
}) => {
  console.log('props', {
    belongs,
    model,
    viewComponent,
    saveActions,
    showTitle,
    formProps,
    onGetRecords,
    children,
  })

  return <React.Fragment>Component is rendered</React.Fragment>
}
