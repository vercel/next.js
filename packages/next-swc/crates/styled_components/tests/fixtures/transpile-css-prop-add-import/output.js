import _styled from "styled-components";
// @flow
import React from 'react';
import Card from '../../shared/components/Card';
import config from '../../../config';
export default (()=><_StyledDiv >

    <Card >

      <h1 >Login or Sign Up</h1>

      <p >

        <a href={config.API_URI + '/auth/google'}>

          Sign up or login with Google

        </a>

      </p>

    </Card>

  </_StyledDiv>
);
var _StyledDiv = _styled("div")`
      width: 35em;
    `;
