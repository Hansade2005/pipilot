// Universal Expo entry. Native's AppEntry imports the root ./App while web resolves ./index,
// so this file exists to give both the same start point; package.json "main" points here.
//
// A real file rather than a Dockerfile `printf "...\n..."`: E2B's v2 builder strips backslash
// escapes from RUN commands, which collapsed the \n separators and wrote this out as a single
// mangled line that failed to parse at runtime.
import { registerRootComponent } from 'expo'
import App from './App'

registerRootComponent(App)
