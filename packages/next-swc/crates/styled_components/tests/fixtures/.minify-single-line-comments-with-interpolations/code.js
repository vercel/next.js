import styled from 'styled-components'

const Test1 = styled.div`
  width: 100%;
  // color: ${'red'};
`

const Test2 = styled.div`
  width: 100%;
  // color: pale${'red'};
`

const Test3 = styled.div`
  width: 100%;
  // color
  ${'red'};
`

const Test4 = styled.div`
  width: 100%;
  // color: ${'red'}-blue;
`

const Test5 = styled.div`
  width: 100%;
  // color: ${'red'}${'blue'};
`

const Test6 = styled.div`
  background: url("https://google.com");
  width: 100%;
  ${'green'} // color: ${'red'}${'blue'};
`

const Test7 = styled.div`
  background: url("https://google.com");
  width: ${p => p.props.width};
  ${'green'} // color: ${'red'}${'blue'};
  height: ${p => p.props.height};
`
