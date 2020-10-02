import React from 'react'
import Heart from '@spectrum-icons/workflow/Heart'

import {
  Flex,
  View,
  Content,
  Button,
  Divider,
  Image,
  Heading,
  Checkbox,
  CheckboxGroup,
  TextArea,
} from '@adobe/react-spectrum'

export default function Home() {
  return (
    <View
      borderWidth="thin"
      borderColor="dark"
      borderRadius="medium"
      padding="size-200"
    >
      <Flex
        direction="row"
        alignItems="center"
        justifyContent="center"
        gap="size-250"
      >
        <Image
          src="https://upload.wikimedia.org/wikipedia/commons/8/8e/Nextjs-logo.svg"
          alt="Next.js logo"
        />
        <Heading marginX="size-100" level={1}>
          +
        </Heading>
        <Heading marginX="size-1" level={1}>
          React Spectrum
        </Heading>
        <Content>
          <Heading marginX="size-125" level={1}>
            = <Heart />
          </Heading>
        </Content>
      </Flex>
      <Divider />

      <Flex direction="row" alignItems="center" justifyContent="center">
        <Heading alignSelf="center" justifySelf="center" level={3}>
          Components
        </Heading>
      </Flex>

      <Flex
        direction="row"
        alignItems="center"
        justifyContent="center"
        gap="size-250"
      >
        <Button variant="cta">Button</Button>
        <CheckboxGroup label="Favorite sports">
          <Checkbox value="soccer">Soccer</Checkbox>
          <Checkbox value="baseball">Baseball</Checkbox>
          <Checkbox value="basketball">Basketball</Checkbox>
        </CheckboxGroup>
        <TextArea label="Description" />
      </Flex>
    </View>
  )
}
