import {
    makeStyles,
    shorthands,
    tokens,
    Tab,
    TabList,
    SelectTabData,
    SelectTabEvent,
    TabValue,
  } from "@fluentui/react-components";
  import * as React from "react";
  
  import {
    AirplaneRegular,
    AirplaneFilled,
    AirplaneTakeOffRegular,
    AirplaneTakeOffFilled,
    TimeAndWeatherRegular,
    TimeAndWeatherFilled,
    bundleIcon,
  } from "@fluentui/react-icons";
  
  const Airplane = bundleIcon(AirplaneFilled, AirplaneRegular);
  const AirplaneTakeOff = bundleIcon(
    AirplaneTakeOffFilled,
    AirplaneTakeOffRegular
  );
  const TimeAndWeather = bundleIcon(TimeAndWeatherFilled, TimeAndWeatherRegular);
  
  const useStyles = makeStyles({
    root: {
      alignItems: "flex-start",
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      ...shorthands.padding("50px", "20px"),
      rowGap: "20px",
    },
    panels: {
      ...shorthands.padding(0, "10px"),
      "& th": {
        textAlign: "left",
        ...shorthands.padding(0, "30px", 0, 0),
      },
    },
    propsTable: {
      "& td:first-child": {
        fontWeight: tokens.fontWeightSemibold,
      },
      "& td": {
        ...shorthands.padding(0, "30px", 0, 0),
      },
    },
  });
  
  export const Panels = () => {
    const styles = useStyles();
  
    const [selectedValue, setSelectedValue] = React.useState<TabValue>(
      "conditions"
    );
  
    const onTabSelect = (event: SelectTabEvent, data: SelectTabData) => {
      setSelectedValue(data.value);
    };
  
    const Arrivals = React.memo(() => (
      <div role="tabpanel" aria-labelledby="Arrivals">
        <table>
          <thead>
            <th>Origin</th>
            <th>Gate</th>
            <th>ETA</th>
          </thead>
          <tbody>
            <tr>
              <td>DEN</td>
              <td>C3</td>
              <td>12:40 PM</td>
            </tr>
            <tr>
              <td>SMF</td>
              <td>D1</td>
              <td>1:18 PM</td>
            </tr>
            <tr>
              <td>SFO</td>
              <td>E18</td>
              <td>1:42 PM</td>
            </tr>
          </tbody>
        </table>
      </div>
    ));
  
    const Departures = React.memo(() => (
      <div role="tabpanel" aria-labelledby="Departures">
        <table>
          <thead>
            <th>Destination</th>
            <th>Gate</th>
            <th>ETD</th>
          </thead>
          <tbody>
            <tr>
              <td>MSP</td>
              <td>A7</td>
              <td>8:26 AM</td>
            </tr>
            <tr>
              <td>DCA</td>
              <td>N2</td>
              <td>9:03 AM</td>
            </tr>
            <tr>
              <td>LAS</td>
              <td>E15</td>
              <td>2:36 PM</td>
            </tr>
          </tbody>
        </table>
      </div>
    ));
  
    const Conditions = React.memo(() => (
      <div role="tabpanel" aria-labelledby="Conditions">
        <table className={styles.propsTable}>
          <tbody>
            <tr>
              <td>Time</td>
              <td>6:45 AM</td>
            </tr>
            <tr>
              <td>Temperature</td>
              <td>68F / 20C</td>
            </tr>
            <tr>
              <td>Forecast</td>
              <td>Overcast</td>
            </tr>
            <tr>
              <td>Visibility</td>
              <td>0.5 miles, 1800 ft runway visual range</td>
            </tr>
          </tbody>
        </table>
      </div>
    ));
  
    return (
      <div className={styles.root}>
        <TabList selectedValue={selectedValue} onTabSelect={onTabSelect}>
          <Tab id="Arrivals" icon={<Airplane />} value="arrivals">
            Arrivals
          </Tab>
          <Tab id="Departures" icon={<AirplaneTakeOff />} value="departures">
            Departures
          </Tab>
          <Tab id="Conditions" icon={<TimeAndWeather />} value="conditions">
            Conditions
          </Tab>
        </TabList>
        <div className={styles.panels}>
          {selectedValue === "arrivals" && <Arrivals />}
          {selectedValue === "departures" && <Departures />}
          {selectedValue === "conditions" && <Conditions />}
        </div>
      </div>
    );
  };