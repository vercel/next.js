import styled from 'styled-components'

export const GlobalContainer = styled.div`
  box-sizing: border-box;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100vw;
  gap: 20px;
  main {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }
`

export const Header = styled.header`
  font-size: 2.5rem;
  margin-top: 2rem;
  span {
    font-weight: 700;
    background: -webkit-linear-gradient(
      45deg,
      rgb(250, 91, 48) 0%,
      rgb(128, 54, 255) 26.88%,
      rgb(213, 63, 255) 50.44%,
      rgb(235, 137, 82) 73.83%,
      rgb(247, 181, 0) 100%
    );
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`

export const TextsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 3rem 5rem;
  box-shadow: rgb(0 0 0 / 10%) 0px 2px 4px;
  border-radius: 5px;
`

export const Text = styled.p`
  text-align: center;
  font-size: 1.1rem;
  letter-spacing: 0.03rem;
  a {
    font-weight: 700;
  }
`

export const Button = styled.button<{ $upload?: boolean }>`
  background: ${(p) =>
    p.$upload
      ? '-webkit-linear-gradient(45deg, rgb(250, 91, 48) 0%, rgb(235, 137, 82) 50%, rgb(247, 181, 0) 100%)'
      : '-webkit-linear-gradient(45deg, rgb(247, 181, 0) 0%, rgb(235, 137, 82) 50%, rgb(250, 91, 48) 100%)'};
  border: none;
  padding: 0.8rem 1.2rem;
  border-radius: 5px;
  color: #ffffff;
  cursor: pointer;
  font-size: 1.2rem;
  font-weight: 500;
`

export const StatusContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 2rem;
  span {
    width: 35px;
    height: 5px;
    border-radius: 5px;
    background-color: rgb(235, 137, 82);
    margin-top: 20px;
  }
`

export const Footer = styled.footer`
  margin-top: auto;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 5px;
  a:nth-of-type(2) {
    font-weight: 600;
    font-size: 1.1rem;
  }
`

export const PlayerSdkContainer = styled.div<{
  $width: number
  $height: number
}>`
  width: ${(p) => (p.$width && p.$width <= 800 ? p.$width : '800')}px;
  height: ${(p) => (p.$height && p.$height <= 250 ? p.$height : '250')}px;
  iframe {
    height: ${(p) => (p.$height <= 250 ? p.$height : '250')}px !important;
  }
`

export const InputsContainer = styled.div`
  display: flex;
  gap: 20px;
  > div {
    display: flex;
    flex-direction: column;
    gap: 5px;
    label {
      font-size: 0.6rem;
    }
  }
  > div:last-child {
    flex-direction: row;
    align-items: center;
    align-self: flex-end;
  }
`
