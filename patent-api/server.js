const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 数据文件路径
const DATA_FILE = path.join(__dirname, 'copilots-data.json');

// 如果数据文件不存在，创建默认数据
if (!fs.existsSync(DATA_FILE)) {
  const defaultData = [
    {
      id: 'my-copilot-01-invention-search',
      name: '🔍 01 发明构思检索',
      picUrl: '',
      prompt: `你是一名资深的专利检索专家，精通各种专利数据库的检索技巧，熟悉IPC分类体系。

你擅长根据技术方案构建高效的检索策略，能够快速定位相关现有技术。

请严格按照以下步骤进行：

1. **技术方案分析**
- 提取发明必要技术特征
- 确定保护范围最大的权利要求
- 识别发明创新点

2. **联网检索**
- 使用搜索引擎搜索相关专利文献
- 搜索技术关键词的中英文表达
- 查找相关领域的核心专利

3. **文献汇总**
对于找到的每篇相关文献，提供以下信息：
| 序号 | 标题 | 公开号/公告号 | 申请人 | 申请日 | 相关度 | 关键技术特征 | 来源地址 |

4. **检索建议**
- 提供IPC分类号
- 提供中英文关键词
- 提供检索式思路

请确保信息来源真实可靠，标注具体的网页链接。`,
      demoQuestion: '帮我检索本发明的现有技术',
      demoAnswer: '',
      starred: true,
      usedCount: 0,
      shared: true
    },
    {
      id: 'my-copilot-02-applicant-research',
      name: '👤 02 申请人信息调研',
      picUrl: '',
      prompt: `你是一名专业的专利信息调研员，擅长收集和分析专利申请人、发明人的背景信息。

请帮我调研以下信息：

1. **申请人信息**
- 公司/个人名称
- 所在地区/国家
- 注册资本（如有）
- 经营范围
- 联系方式

2. **发明人信息**
- 发明人姓名
- 关联的其他专利
- 教育背景（如有）

3. **公司背景调查**
- 成立时间
- 规模（员工数量）
- 融资情况
- 核心业务
- 专利布局情况

4. **信息来源**
请提供真实可靠的信息来源，包括但不限于：
- 国家知识产权局
- 天眼查/企查查
- 公司官网
- 新闻报道

5. **注意事项**
- 如无法获取某项信息，请如实说明
- 区分事实性信息和推测性信息
- 提供信息获取的日期

请以结构化方式呈现调研结果。`,
      demoQuestion: '调研本申请申请人/发明人的信息',
      demoAnswer: '',
      starred: true,
      usedCount: 0,
      shared: true
    }
  ];
  
  fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
  console.log('✅ 已创建数据文件: copilots-data.json');
}

// 动态读取数据
function getCopilots() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.error('读取数据文件失败:', e);
    return [];
  }
}

// 接口：获取精选列表
app.post('/api/copilots/list', (req, res) => {
  const { lang } = req.body;
  console.log(`收到请求，语言: ${lang}`);
  const copilots = getCopilots();
  console.log(`返回 ${copilots.length} 个搭子`);
  res.json({
    data: copilots
  });
});

// 接口：记录分享（可选）
app.post('/api/copilots/share-record', (req, res) => {
  console.log('收到分享记录:', req.body);
  res.json({ success: true });
});

// 启动服务器
const PORT = 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(50));
  console.log('🎉 服务器启动成功！');
  console.log('='.repeat(50));
  console.log(`📍 本地访问: http://localhost:${PORT}`);
  console.log(`📍 局域网访问: http://192.168.101.5:${PORT}`);
  console.log('');
  console.log('📝 数据文件: copilots-data.json');
  console.log('💡 修改数据后无需重启，刷新页面即可生效！');
  console.log('');
  console.log('按 Ctrl+C 停止服务器');
  console.log('='.repeat(50));
});
