import styled from 'styled-components'

const WithAttrs = styled.div.attrs({ some: 'value' })``
const WithAttrsWrapped = styled(Inner).attrs({ some: 'value' })``
