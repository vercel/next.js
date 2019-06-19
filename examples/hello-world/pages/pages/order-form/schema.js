const defaultSchema = [
  {
    key: "coffee",
    data_type: "string",
    is_required: true,
    ui_type: "select",
    default: "",
    properties: {
      label: "Coffee",
      placeholder: "",
      items: [
        "americano",
        "americano misto",
        "cappuccino",
        "chai latte",
        "espresso",
        "flat white",
        "latte",
        "london fog",
        "tokyo fog",
        "mocha",
        "machiatto"
      ]
    }
  },
  {
    key: "shots",
    data_type: "number",
    is_required: true,
    ui_type: "select",
    default: "",
    properties: {
      label: "Shots",
      placeholder: "",
      items: [0, 1, 2, 3, 4]
    }
  },
  {
    key: "temp",
    data_type: "string",
    is_required: true,
    ui_type: "select",
    default: "",
    properties: {
      label: "Temperature",
      placeholder: "",
      items: ["hot", "cold"]
    }
  },
  {
    key: "caffinated",
    data_type: "string",
    is_required: true,
    ui_type: "select",
    default: "",
    properties: {
      label: "Caffinated",
      placeholder: "",
      items: ["caffinated", "decaf"]
    }
  },
  {
    key: "dairy",
    data_type: "string",
    is_required: true,
    ui_type: "select",
    default: "",
    properties: {
      label: "Type of Dairy",
      placeholder: "",
      items: ["none", "milk", "skim", "soy", "almond"]
    }
  },
  {
    key: "flavor",
    data_type: "string",
    is_required: true,
    ui_type: "select",
    default: "",
    properties: {
      label: "Flavor",
      placeholder: "",
      items: [
        "none",
        "caramel",
        "cardamom",
        "cinnamon",
        "hazelnut",
        "honey",
        "peppermint",
        "vanilla"
      ]
    }
  },
  {
    key: "notes",
    data_type: "string",
    ui_type: "textarea",
    default: "",
    properties: {
      label: "Notes",
      placeholder: ""
    }
  }
];

export default defaultSchema;
