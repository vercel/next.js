import styled from "styled-components";
import { MetroSpinner } from "react-spinners-kit";

const LoaderContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  z-index: 2;
  position: absolute;
  top: 0;
`;

const Loader = () => (
  <LoaderContainer>
    <MetroSpinner size={50} color="#686769" />
  </LoaderContainer>
);

export default Loader;
