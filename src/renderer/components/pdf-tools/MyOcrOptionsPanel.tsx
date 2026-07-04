/**
 * myOCR 参数面板 (v8.0 新增)
 *
 * 紧凑设计：所有参数尽量放在一行，条件渲染（仅 myOCR 服务商显示）
 * 包含：语言多选 / deskew / rotate / PDF/A / 环境检测 Badge
 */

import {
  Group,
  Stack,
  Switch,
  MultiSelect,
  NumberInput,
  Badge,
  Tooltip,
} from '@mantine/core'
import { IconRefresh, IconAlertCircle, IconCheck } from '@tabler/icons-react'
import { useCallback } from 'react'

/** Tesseract 支持的语言列表（常用，含组合语言） */
const LANGUAGES = [
  { value: 'eng', label: 'eng 英语' },
  { value: 'chi_sim', label: 'chi_sim 简体中文' },
  { value: 'chi_tra', label: 'chi_tra 繁体中文' },
  { value: 'chi_sim+eng', label: '简体中文+英文' },
  { value: 'chi_tra+eng', label: '繁体中文+英文' },
  { value: 'jpn', label: 'jpn 日语' },
  { value: 'jpn+eng', label: '日语+英文' },
  { value: 'kor', label: 'kor 韩语' },
  { value: 'kor+eng', label: '韩语+英文' },
  { value: 'fra', label: 'fra 法语' },
  { value: 'deu', label: 'deu 德语' },
  { value: 'spa', label: 'spa 西班牙语' },
  { value: 'ita', label: 'ita 意大利语' },
  { value: 'por', label: 'por 葡萄牙语' },
  { value: 'rus', label: 'rus 俄语' },
  { value: 'ara', label: 'ara 阿拉伯语' },
]

export interface MyOcrOptions {
  languages?: string[]
  deskew?: boolean
  rotatePages?: boolean
  outputType?: 'pdf' | 'pdfa' | 'pdfa-1' | 'pdfa-2'
  jobs?: number
}

export interface EnvironmentStatus {
  ok: boolean
  ocrmypdf?: { version: string; path: string }
  tesseract?: { version: string; path: string; languages: string[] }
  ghostscript?: { version: string; path: string }
  missing: string[]
  installHint?: string
}

interface Props {
  value: MyOcrOptions
  onChange: (v: MyOcrOptions) => void
  /** 环境检测结果 */
  envStatus: EnvironmentStatus | null
  /** 检测中状态 */
  isDetecting: boolean
  /** 手动触发环境检测 */
  onDetectEnv: () => void
}

export function MyOcrOptionsPanel({
  value,
  onChange,
  envStatus,
  isDetecting,
  onDetectEnv,
}: Props) {
  const handleLanguagesChange = useCallback(
    (vals: string | string[]) => {
      const langs = Array.isArray(vals) ? vals : vals ? [vals] : []
      onChange({ ...value, languages: langs })
    },
    [value, onChange],
  )

  return (
    <Group gap="xs" wrap="wrap" align="center">
      {/* OCR 语言（默认简体中文+英文） */}
      <MultiSelect
        size="xs"
        w={180}
        data={LANGUAGES}
        value={value.languages ?? ['chi_sim+eng']}
        onChange={handleLanguagesChange}
        placeholder="语言"
        searchable
        clearable
        maxDropdownHeight={220}
      />

      {/* deskew */}
      <Switch
        size="xs"
        label="deskew"
        checked={value.deskew !== false}
        onChange={(e) =>
          onChange({ ...value, deskew: e.currentTarget.checked })
        }
        styles={{ label: { fontSize: 11, paddingLeft: 2 } }}
      />

      {/* rotate */}
      <Switch
        size="xs"
        label="rotate"
        checked={value.rotatePages !== false}
        onChange={(e) =>
          onChange({ ...value, rotatePages: e.currentTarget.checked })
        }
        styles={{ label: { fontSize: 11, paddingLeft: 2 } }}
      />

      {/* PDF/A */}
      <Switch
        size="xs"
        label="PDF/A"
        checked={value.outputType !== 'pdf'}
        onChange={(e) =>
          onChange({
            ...value,
            outputType: e.currentTarget.checked ? 'pdfa-2' : 'pdf',
          })
        }
        styles={{ label: { fontSize: 11, paddingLeft: 2 } }}
      />

      {/* jobs */}
      <NumberInput
        size="xs"
        w={52}
        min={1}
        max={16}
        value={value.jobs ?? 1}
        onChange={(v) =>
          onChange({ ...value, jobs: Number(v) || 1 })
        }
        placeholder="jobs"
        styles={{ input: { fontSize: 11 } }}
      />

      {/* 环境检测按钮 */}
      <Tooltip
        label={
          isDetecting
            ? '检测中...'
            : '检测本机 ocrmypdf / tesseract / gs 安装状态'
        }
      >
        <Badge
          size="sm"
          variant="light"
          color="gray"
          style={{ cursor: 'pointer', userSelect: 'none' }}
          onClick={onDetectEnv}
          leftSection={<IconRefresh size={10} />}
        >
          {isDetecting ? '检测中...' : '检测环境'}
        </Badge>
      </Tooltip>

      {/* 环境状态 Badge */}
      {envStatus && (
        <Stack gap={2}>
          {envStatus.ocrmypdf && (
            <Badge
              size="xs"
              color="green"
              variant="light"
              leftSection={<IconCheck size={8} />}
            >
              OCRmyPDF
            </Badge>
          )}
          {envStatus.tesseract && (
            <Badge
              size="xs"
              color="green"
              variant="light"
              leftSection={<IconCheck size={8} />}
            >
              Tesseract
            </Badge>
          )}
          {envStatus.ghostscript && (
            <Badge
              size="xs"
              color="green"
              variant="light"
              leftSection={<IconCheck size={8} />}
            >
              GS
            </Badge>
          )}
          {envStatus.missing.map((m) => (
            <Badge
              key={m}
              size="xs"
              color="red"
              variant="light"
              leftSection={<IconAlertCircle size={8} />}
            >
              缺:{m}
            </Badge>
          ))}
        </Stack>
      )}
    </Group>
  )
}
