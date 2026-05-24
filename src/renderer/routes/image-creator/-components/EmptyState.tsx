import { Flex, Text, UnstyledButton } from '@mantine/core'
import { IconPhoto } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'

export interface EmptyStateProps {
  onPromptSelect: (prompt: string) => void
}

/**
 * 语言 → 图片生成指令映射
 * 根据当前系统语言，追加对应语言的指令，让生成的图片文字内容与系统语言一致
 */
const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  'zh-Hans': 'Important: 图片中的所有文字内容请使用简体中文。',
  'zh-Hant': 'Important: 圖片中的所有文字內容請使用繁體中文。',
  en: 'Important: All text content in the image should be in English.',
  ja: 'Important: 画像内のすべてのテキストは日本語で記述してください。',
  ko: 'Important: 이미지의 모든 텍스트는 한국어로 작성해주세요.',
  ru: 'Important: Весь текст на изображении должен быть на русском языке.',
  de: 'Important: Der gesamte Text im Bild muss auf Deutsch sein.',
  fr: "Important: Tout le texte de l'image doit être en français.",
  'pt-PT': 'Important: Todo o texto na imagem deve estar em português.',
  'it-IT': 'Important: Tutto il testo nell\'immagine deve essere in italiano.',
  es: 'Important: Todo el texto en la imagen debe estar en español.',
  ar: 'Important: يجب أن تكون جميع النصوص في الصورة باللغة العربية.',
  sv: 'Important: All text i bilden ska vara på svenska.',
  'nb-NO': 'Important: All tekst i bildet skal være på norsk.',
}

/**
 * 获取当前系统语言对应的图片文字指令
 */
function getLanguageInstruction(): string {
  const lang = i18n.language
  return LANGUAGE_INSTRUCTIONS[lang] || LANGUAGE_INSTRUCTIONS.en
}

/**
 * 快捷提示词配置
 * displayKey: i18n 翻译 key（用英文ID确保所有语言都能匹配）
 * expanded: 发送给AI的完整英文prompt（固定英文，AI对英文理解更好）
 *
 * 实际发送时，expanded 末尾会自动追加语言指令（根据系统语言自适应）
 */
const QUICK_PROMPTS = [
  {
    displayKey: 'quick_prompt_huang',
    expanded: `Generate a realistic Douyin (TikTok China) live streaming mobile phone screenshot. Main scene: Jensen Huang (Huang Renxun) is hosting a livestream to sell his latest GPU chip. The top of the phone screen displays "人工智能网络" (AI Network) as the network name. Includes typical Douyin live interface elements: likes count, comments floating across the screen, shopping cart icon, gift animations, and a vibrant "Buy Now" button. The atmosphere should feel authentic like a Chinese e-commerce livestream with energetic hosting style. Genuine smartphone screenshot aesthetic, realistic UI interface, mobile portrait 9:16 aspect ratio.`,
  },
  {
    displayKey: 'quick_prompt_subway',
    expanded: `A 20-year-old French girl with classic Parisian aesthetic style, sitting on a subway train reading a book titled "The Film Poet" in French. Director Wes Anderson inspired visual style: perfectly symmetrical composition, soft pastel color palette, precise geometric framing, cinematic lighting with warm nostalgic tones. The scene features the subway carriage interior with balanced geometry, carefully curated color scheme of muted reds, yellows and teals. Film grain texture, anamorphic lens feel, meticulous attention to every visual element in frame. 3:2 aspect ratio.`,
  },
  {
    displayKey: 'quick_prompt_kubrick',
    expanded: `A cinematic movie poster about legendary director Stanley Kubrick. Layout from top to bottom: Upper section features Kubrick's iconic portrait with his biography and famous philosophical quotes. Middle section presents his distinctive artistic style, recurring themes, and directorial philosophy. Lower section showcases his most iconic films (2001: A Space Odyssey, A Clockwork Orange, The Shining, etc.) with representative images and text descriptions. Dramatic chiaroscuro lighting, high contrast black and white tones mixed with selective color accents, professional cinema poster typography, one-point perspective composition. 9:16 portrait aspect ratio.`,
  },
  {
    displayKey: 'quick_prompt_kd',
    expanded: `A professional scientific paper illustration explaining Knowledge Distillation (KD) neural network architecture in speech signal processing. Clean academic diagram style suitable for IEEE/ACM conference publication: shows a large teacher network (complex transformer architecture) on the left transferring knowledge to a smaller student network (lightweight model) on the right. Visualize knowledge transfer paths with dashed arrows, feature distillation process, intermediate representations, and output probability distributions. Each important node, layer, and component is clearly labeled with technical annotations. Minimalist color scheme (blues, grays, with accent colors for key elements). 3:2 aspect ratio.`,
  },
  {
    displayKey: 'quick_prompt_notes',
    expanded: `Aesthetic handwritten study infographic poster designed like a beautifully organized digital-notebook page, soft pastel color palette with gentle tones of baby pink, sky blue, mint green, lavender, and soft yellow highlights. The background is a realistic notebook paper grid texture with subtle shadows and paper grain for authenticity. The layout is clean and structured like high-quality study notes, featuring neatly written handwritten-style typography in smooth black ink and blue pen. Content is arranged in well-spaced bullet points, numbered sections, and small boxed highlights for key information. Important words are emphasized using pastel highlighter strokes in pink, yellow, and light blue. Decorative elements include cute hand-drawn doodles in the margins such as stars, arrows, hearts, smiley faces, paper clips, sticky notes, and simple icons (books, pens, lightbulb, checklist). Sticky notes are layered naturally on the page with soft shadows, slightly tilted for a realistic collage effect. The composition feels cozy, aesthetic, and highly organized—like a Pinterest viral study aesthetic or an Instagram "studygram" post. Soft lighting, gentle shadows, and minimal clutter ensure readability while maintaining visual charm. The design feels calming, motivating, and academically inspiring. Ultra-detailed, 4K resolution, top-down flat lay perspective, modern stationery aesthetic, soft depth of field, realistic paper texture, high-end digital illustration style.`,
  },
]

export function EmptyState({ onPromptSelect }: EmptyStateProps) {
  const { t } = useTranslation()

  return (
    <Flex direction="column" align="center" justify="center" className="min-h-[60vh]">
      {/* Simple Icon */}
      <div className="w-20 h-20 rounded-2xl bg-[var(--chatbox-background-secondary)] flex items-center justify-center mb-6">
        <IconPhoto size={40} className="text-[var(--chatbox-tint-tertiary)]" stroke={1.5} />
      </div>

      <Text size="xl" fw={600} mb="xs" className="text-center">
        {t('Create amazing images')}
      </Text>
      <Text size="sm" c="dimmed" maw={420} className="text-center" mb="xl">
        {t('Describe the image you want to generate. Be as detailed as possible for best results.')}
      </Text>

      {/* Quick Prompts - Grid Layout */}
      <Flex gap="sm" wrap="wrap" justify="center" maw={600}>
        {QUICK_PROMPTS.map((item) => {
          // 构建发送给AI的完整prompt = 英文prompt + 语言指令
          const fullPrompt = `${item.expanded}\n\n${getLanguageInstruction()}`
          return (
            <UnstyledButton
              key={item.displayKey}
              onClick={() => onPromptSelect(fullPrompt)}
              className="px-4 py-3 rounded-xl bg-[var(--chatbox-background-secondary)] hover:bg-[var(--chatbox-background-tertiary)] transition-colors duration-200"
              style={{ maxWidth: 280 }}
            >
              <Text size="sm" ta="center">
                {t(item.displayKey)}
              </Text>
            </UnstyledButton>
          )
        })}
      </Flex>
    </Flex>
  )
}
