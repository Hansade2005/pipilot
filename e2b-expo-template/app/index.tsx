import { View, Text, StyleSheet } from 'react-native'

export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your app starts here</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a', padding: 24 },
  title: { color: '#fafafa', fontSize: 22, fontWeight: '600', textAlign: 'center' },
})
