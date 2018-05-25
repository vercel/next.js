import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  text: {
    alignItems: 'center',
    fontSize: 24
  }
})

export default props => (
  <View style={styles.container}>
    <Text style={styles.text}>Welcome to Next.js!</Text>
  </View>
)
