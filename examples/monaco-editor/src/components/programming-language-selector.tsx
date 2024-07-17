import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Language } from './editor'

const languages = ['javascript', 'typescript', 'php', 'python']

export function ProgrammingLanguageSelector(props: {
  selectedLanguage: Language
  onSelectLanguageChange: (language: Language) => void
}) {
  const { selectedLanguage, onSelectLanguageChange } = props
  return (
    <Select value={selectedLanguage} onValueChange={onSelectLanguageChange}>
      <SelectTrigger className="w-[180px] m-1">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Programming languages</SelectLabel>
          {languages.map((language) => (
            <SelectItem value={language} key={language}>
              {language}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
