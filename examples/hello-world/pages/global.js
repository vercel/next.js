import { createGlobalStyle, css } from "styled-components";

const GlobalStyle = createGlobalStyle`
  html, body, #__next, #__next > div {
    height: 100%;
  }

  body {
    margin: 0;
  }

  body.dark-mode {
    background: #111111;
    color: #e1e1e1;

    [class^="loader__LoaderContainer"] {
      background-color: #111111;
      
      [class^="metro__Ball"]:before {
        background-color: #2a88ce;
      }
    }

    button {
      .mdc-tab__text-label {
        color: #e1e1e1;
      }

      .mdc-tab-indicator__content.mdc-tab-indicator__content--underline {
        background-color: #2a88ce;
      }
    }

    button .mdc-button__label {
      color: #2a88ce;
    }

    .mdc-card {
      background: #1d1d1d;
      border: transparent;
    }

    .mdc-list {
      background: #2d2d2d;
      color: #e1e1e1;

      .mdc-list-item__secondary-text {
        color: #888888;
      }

      i {
        color: #e1e1e1;
      }
    }

    .mdc-select {
      background-color: #2d2d2d;

      select, .mdc-floating-label {
        color: #e1e1e1 !important;
      }
    }

    .mdc-text-field.mdc-text-field--outlined.mdc-text-field--textarea {
      textarea, .mdc-floating-label {
        color: #e1e1e1 !important;
      }
    }

    .mdc-text-field--focused:not(.mdc-text-field--disabled),
    .mdc-select--focused:not(.mdc-select--disabled) {
      .mdc-floating-label {
        color: #e1e1e1 !important;
      }

      i.mdc-select__dropdown-icon {
        background-image: url(data:image/svg+xml,%3Csvg%20width%3D%2210px%22%20height%3D%225px%22%20viewBox%3D%227%2010%2010%205%22%20version%3D%221.1%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20xmlns%3Axlink%3D%22http%3A%2F%2Fwww.w3.org%2F1999%2Fxlink%22%3E%0A%20%20%20%20%3Cpolygon%20id%3D%22Shape%22%20stroke%3D%22none%22%20fill%3D%22%23e1e1e1%22%20fill-rule%3D%22evenodd%22%20opacity%3D%221%22%20points%3D%227%2010%2012%2015%2017%2010%22%3E%3C%2Fpolygon%3E%0A%3C%2Fsvg%3E);
      }
    }
  }

  .mdc-text-field--focused:not(.mdc-text-field--disabled),
  .mdc-select--focused:not(.mdc-select--disabled) {
    .mdc-floating-label {
      color: #001638 !important;
    }

    i.mdc-select__dropdown-icon {
      background-image: url(data:image/svg+xml,%3Csvg%20width%3D%2210px%22%20height%3D%225px%22%20viewBox%3D%227%2010%2010%205%22%20version%3D%221.1%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20xmlns%3Axlink%3D%22http%3A%2F%2Fwww.w3.org%2F1999%2Fxlink%22%3E%0A%20%20%20%20%3Cpolygon%20id%3D%22Shape%22%20stroke%3D%22none%22%20fill%3D%22%23001638%22%20fill-rule%3D%22evenodd%22%20opacity%3D%221%22%20points%3D%227%2010%2012%2015%2017%2010%22%3E%3C%2Fpolygon%3E%0A%3C%2Fsvg%3E);
    }
  }


  .mdc-top-app-bar__title {
    display: flex;

    svg {
      height: 34px;
      width: auto;
    }
  }

  .mdc-layout-grid__inner {
    margin-bottom: 16px;
  }

  select.mdc-select__native-control {
    text-transform: capitalize;
  }

  .Toastify__toast-container.Toastify__toast-container--bottom-center {
    width: initial;
    max-width: 450px;
  }

  .Toastify__toast.Toastify__toast--default {
    background: #333333;
    color: #ffffffde;
    display: flex;
    align-items: center;
    line-height: 20px;
    font-size: 14px;
    font-weight: 400;
    letter-spacing: 0.25px;
    box-shadow: 0 3px 5px -1px rgba(0,0,0,.2), 0 6px 10px 0 rgba(0,0,0,.14), 0 1px 18px 0 rgba(0,0,0,.12);
    border-radius: 4px;

    .Toastify__close-button {
      color: #ffffffde;
      align-self: initial;
    }
  }
`;

const sizes = {
  desktop: 1024,
  tablet: 768,
  phone: 425
};
// Iterate through the sizes and create a media template
export const media = Object.keys(sizes).reduce((acc, label) => {
  acc[label] = (...args) => css`
    @media (max-width: ${sizes[label] / 16}rem) {
      ${css(...args)}
    }
  `;
  return acc;
}, {});

export default GlobalStyle;
