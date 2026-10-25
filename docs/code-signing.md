# Windows 代码签名（PatentHub）

> 适用版本：v1.4.6 起；当前 1.4.6 安装包为 `NotSigned`（未签名）。
> 本文说明「是什么、为什么要做、怎么买、怎么接、怎么验证」。

---

## 一、代码签名是什么

用代码签名证书对 `Setup.exe` / `Portable.exe` / 程序主体做数字签名，Windows 通过签名可以验证：

1. **发布者身份**（是谁发布的，证书主体）
2. **文件完整性**（签名后是否被篡改）

签名后文件属性会出现「数字签名」页；用 `Get-AuthenticodeSignature` 可查看状态。

### 不签名会怎样

| 影响 | 说明 |
|---|---|
| SmartScreen 提示 | 「Windows 已保护你的电脑 / 未知发布者」，用户需点「更多信息 → 仍要运行」 |
| 杀软/EDR 拦截 | 360、火绒、Defender 等对未知 exe 更敏感，易误报 |
| 企业管控 | 域内 AppLocker / WDAC 白名单通常只放行已签名程序 |
| 自动更新校验 | 开启 electron-updater 后，`publisherName` 与签名主体不一致会拒绝更新 |
| 溯源与防篡改 | 无签名时无法证明包来自本单位 |

> 注意：**签名 ≠ 杀软白名单**。签名只解决「身份 + 完整性」，误报仍需向各厂商提交申诉。

---

## 二、证书类型怎么选

| 类型 | 适用场景 | SmartScreen 表现 | 私钥形态 | 参考成本（年） |
|---|---|---|---|---|
| **自签名**（自己生成） | 内网试点、内部测试 | 仍提示未知发布者，需域内下发根证书 | 本机证书库 / .pfx | 0 |
| **OV**（组织验证） | 对外分发 | 需累积下载信誉（数周~数月） | **硬件令牌 / 云 HSM** | 约 2–4 千元 |
| **EV**（扩展验证） | 对外分发、要求较高 | 信誉建立通常更快 | **硬件令牌 / 云 HSM** | 约 4–8 千元 |
| **云签名服务** | 多人/CI、无私钥落盘 | 同 OV/EV | 云端 HSM | 按年订阅 |

> **关键政策**：自 2023-06 起，CA/B Forum 要求 OV/EV 代码签名私钥必须存放在 **FIPS 140-2 Level 2 硬件**（USB Token 或云 HSM）。新证书一般**不再提供可自由拷贝的 .pfx**；能拿到 .pfx 的多为自签名或 2023 年前签发的老证书。

### 采购渠道

- **国际 CA**：DigiCert、Sectigo、GlobalSign、Entrust（OV/EV；云签名产品：DigiCert KeyLocker、Sectigo Cloud Signing、SSL.com eSigner、GlobalSign Atlas）
- **国内 CA**：CFCA（中国金融认证中心）、天威诚信 iTrusChina、沃通 WoSign、上海 CA 等（政采/央采、发票与合规更便利）
- **微软方案**：Microsoft Trusted Signing（Azure 订阅，需组织验证；可用性以官方为准）
- 采购方式：CA 官网 / 授权代理商 / 政采云·央采平台 / 集团统一采购

### 需要准备的材料（以 OV/EV 为例）

- 营业执照或事业单位法人证书、统一社会信用代码
- 法人授权书、经办人身份证明、单位联系电话/邮箱验证
- 部分 CA 需公函、公章扫描件、办公地址核验
- 周期：OV 约 3–10 个工作日；EV 约 1–3 周（含硬件寄送）

---

## 三、三种接入方式（本仓库已适配）

### 方式 A：USB Token / 证书已安装到 Windows 证书库（OV/EV 常见）

1. 安装令牌驱动（如 SafeNet Authentication Client），插入令牌并登录
2. 确认证书可见：

```powershell
Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
  Select-Object Subject, Thumbprint, NotAfter
```

3. 在 `electron-builder.yml` 的 `win` 下启用（二选一）：

```yaml
win:
  certificateSubjectName: "证书 Subject 中的 CN，例如 PatentHub Code Signing"
  # 或更精确（推荐，避免多张同名证书）：
  # certificateSha1: "证书指纹（去掉空格，大写）"
```

4. 直接打包，electron-builder 会调用缓存的 signtool 完成签名：

```powershell
npx electron-builder build --publish never --win
```

> signtool 路径：`%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\windows-10\x64\signtool.exe`

### 方式 B：.pfx 文件（自签名，或 2023 年前的老证书）

**不要把密码写进仓库**，用环境变量：

```powershell
$env:CSC_LINK = 'F:\certs\patenthub.pfx'
$env:CSC_KEY_PASSWORD = '********'
npx electron-builder build --publish never --win
Remove-Item Env:CSC_LINK, Env:CSC_KEY_PASSWORD
```

也可在 `electron-builder.yml` 里写 `certificateFile` / `certificatePassword`（不推荐）。

### 方式 C：云 HSM 签名（CI/多人协作，无私钥落盘）

用 `win.sign` 指向自定义脚本（不同服务商命令不同）：

```yaml
win:
  sign: ./scripts/sign-windows.mjs
```

```js
// scripts/sign-windows.mjs（示例骨架，按服务商替换命令）
import { execFileSync } from 'node:child_process'

export default async function sign(configuration) {
  // configuration.path = 待签名的 exe 绝对路径
  execFileSync(
    'smctl',
    ['sign', '--input', configuration.path, '--keypair-alias', process.env.SIGN_KEY_ALIAS, '--timestamp'],
    { stdio: 'inherit' }
  )
}
```

常见 CLI：Sectigo `smctl`、SSL.com `CodeSignTool`、DigiCert KeyLocker `smctl`、Azure Trusted Signing `trusted-signing-cli`。

---

## 四、本仓库推荐配置

`electron-builder.yml` 的 `win` 段已预留注释块，启用时取消注释即可：

```yaml
win:
  publisherName: 专利审查四川中心        # ⚠ 必须与证书 Subject 中的名称一致
  certificateSubjectName: "证书 CN"
  # certificateSha1: "A1B2C3D4..."
  signingHashAlgorithms:
    - sha256
  rfc3161TimeStampServer: http://timestamp.digicert.com   # 时间戳（必须）
```

要点：

1. **`publisherName` 必须与证书主体一致**。当前是「专利审查四川中心」；若证书 CN/O 不是这个名称，务必同步修改，否则开启自动更新时 electron-updater 会拒绝更新。
2. **必须加 RFC3161 时间戳**。否则证书到期后，已签名的安装包签名会失效。
3. **签名要在打包过程中完成**（electron-builder 先签名再生成 `latest.yml` / `.blockmap`）。
   不要对已打包的 exe 事后补签——文件哈希会变，blockmap / latest.yml 全部失效。
4. 哈希算法用 `sha256`（`sha1` 已被淘汰）。

---

## 五、验证签名

```powershell
Get-AuthenticodeSignature .\release\build\PatentHub-1.4.6-Setup.exe |
  Format-List Status, StatusMessage, SignerCertificate, TimeStamperCertificate

& "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\windows-10\x64\signtool.exe" `
  verify /pa /v .\release\build\PatentHub-1.4.6-Setup.exe
```

预期：`Status = Valid`、`SignerCertificate.Subject` 与 `publisherName` 一致、`TimeStamperCertificate` 不为空；
`release\build\win-unpacked\PatentHub.exe` 的 `Status` 也应为 `Valid`。

---

## 六、常见坑

| 现象 | 原因 / 解决 |
|---|---|
| `No certificates were found` | 令牌未插入 / 驱动未装 / 证书不在 `CurrentUser\My`；改用 `certificateSha1` 精确指定 |
| 多张同名证书签错 | 用 `certificateSha1`（证书指纹） |
| 时间戳失败 | 内网访问不了 `timestamp.digicert.com`，换 `http://timestamp.sectigo.com` 或 `http://timestamp.globalsign.com/tsa/r6advanced1` |
| 签完仍提示未知发布者 | OV 新证书需要累积下载信誉；EV/云签名通常更快。也可用企业策略下发信任 |
| 自动更新报「签名校验失败」 | `publisherName` 与证书主体不一致 |
| 杀软仍报毒 | 签名不解决误报，需向 360/火绒/Defender 提交样本申诉 |
| 内网无法验证 | 自签名证书需把根证书通过组策略部署到「受信任的根证书颁发机构」 |

---

## 七、自签名快速验证（不改业务代码）

用于内部试点，验证整条签名链路是否打通：

```powershell
# 1) 生成代码签名证书（当前用户证书库）
$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=PatentHub Internal Test" `
  -CertStoreLocation Cert:\CurrentUser\My `
  -NotAfter (Get-Date).AddYears(1)

# 2) 导出 pfx
$pwd = ConvertTo-SecureString -String "Test@12345" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath .\patenthub-test.pfx -Password $pwd

# 3) 带签名打包
$env:CSC_LINK = (Resolve-Path .\patenthub-test.pfx).Path
$env:CSC_KEY_PASSWORD = 'Test@12345'
$env:PATENTHUB_UPDATE_URL = ''
pnpm run build
npx electron-builder build --publish never --win

# 4) 验证 + 清理
Get-AuthenticodeSignature .\release\build\PatentHub-1.4.6-Setup.exe | Format-List Status, SignerCertificate
Remove-Item Env:CSC_LINK, Env:CSC_KEY_PASSWORD
```

> 自签名结果是「签名存在但证书链不受信任」（`Status` 通常为 `UnknownError`）；
> 把该证书导入「受信任的根证书颁发机构」后才会变成 `Valid`。对外分发请使用 OV/EV。

---

## 八、与自动更新的关系

- 当前自动更新**默认关闭**（见 `docs/auto-update.md`）。
- 如后续启用自动更新，务必：
  - 安装包签名；
  - `win.verifyUpdateCodeSignature: true`；
  - `win.publisherName` 与证书主体严格一致。
- 否则 electron-updater 会认为更新包来源不可信而拒绝安装。

---

## 九、下一步

1. **内网试用**：按第七节跑一遍自签名流程（需要的话我可以直接执行，产出签名测试包）。
2. **正式对外**：向 CA 采购 OV/EV（或云签名）。拿到后告诉我：
   - 证书类型（USB Token / .pfx / 云 HSM）
   - 证书 Subject 或 SHA1 指纹（**不要发私钥/密码**）
   我会改好 `electron-builder.yml` 并重打两个 Windows 包，验证 `Status = Valid`。
3. **配套**：同步更新 `publisherName`、README 中的校验哈希与签名说明。


