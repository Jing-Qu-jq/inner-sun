// UI string resources. Add a new locale by adding another top-level key with
// the same set of keys — the language switch and <LanguageProvider> pick it up
// automatically. Care-Pattern / AI-reply localization is handled server-side
// (see the build plan, Feature 15); this file covers static UI copy only.

export const translations = {
    en: {
        'nav.home': 'Home',
        'nav.startChatting': 'Start Chatting',
        'nav.meetTeam': 'Meet Our Team',
        'nav.language': 'Language',
        'nav.login': 'Login',

        'hero.title': 'You’re not alone — wherever home is',
        'hero.lead':
            'Warm, culturally-aware emotional support for international students. Anonymous, secure, and here whenever you need it — in English or 中文.',
        'hero.ctaChat': 'Start chatting',
        'hero.ctaCounselors': 'Meet our counselors',

        'how.title': 'How it works',
        'how.subtitle':
            'Support in three simple steps — from your first message to talking with a real person.',
        'how.s1.title': 'Share what’s on your mind',
        'how.s1.body':
            'Start a private conversation — no sign-up needed. Chat anonymously, anytime, in the language you’re most comfortable with.',
        'how.s2.title': 'We understand your world',
        'how.s2.body':
            'InnerSun draws on guidance from researchers who study international-student wellbeing, and responds with warmth and cultural awareness.',
        'how.s3.title': 'Connect with a real counselor',
        'how.s3.body':
            'When you’re ready, we help you reach a human counselor who understands the experience of studying far from home.',

        'why.title': 'Why InnerSun',
        'why.subtitle':
            'A companion that actually gets what it’s like to be an international student.',
        'why.v1.title': 'Built for students abroad',
        'why.v1.body':
            'Homesickness, culture shock, academic pressure, visa stress — InnerSun understands the challenges of living and studying far from home.',
        'why.v2.title': 'Grounded in research',
        'why.v2.body':
            'Replies are shaped by clinician-authored guidance on international-student mental health — not generic chatbot answers.',
        'why.v3.title': 'Bilingual & always on',
        'why.v3.body':
            'Talk in English or 简体中文, any hour of the day — whenever the feeling hits, not just during office hours.',

        'map.title': 'Bridging home and here',
        'map.subtitle':
            'From campuses across the U.S. to families back in China and beyond — InnerSun keeps you connected to support that feels like home.',
        'map.node.us': 'United States',
        'map.node.cn': 'China',

        'trust.t1': '100% Anonymous',
        'trust.t2': 'Secure & Private',
        'trust.t3': 'Culturally Aware',
        'trust.t4': 'Here for You, Anytime',
        'trust.note':
            'InnerSun offers emotional support, not emergency care. If you’re in crisis, please contact your local emergency services or a crisis hotline right away.',

        'cta.title': 'Ready to talk?',
        'cta.text': 'It’s free to start, and completely anonymous.',
        'cta.chat': 'Start chatting',
        'cta.human': 'Talk to a human',

        'team.title': 'Meet Our Team',
        'team.sample':
            'Sample content — placeholder profiles and photos shown for preview. Real team members are coming soon.',

        'footer.tagline': 'AI psychological counseling assistant for international students',
        'footer.contact': 'Contact',
        'footer.emailLabel': 'Email',
        'footer.links': 'Links',
        'footer.privacy': 'Privacy Policy',
        'footer.terms': 'Terms of Service',
        'footer.rights': 'All rights reserved.',

        'chat.heading': 'What can I help you with?',
        'chat.placeholder': 'Message InnerSun',
        'chat.send': 'Send',

        'login.title': 'Log in',
        'login.email': 'Email',
        'login.password': 'Password',
        'login.remember': 'Remember me',
        'login.submit': 'Log in',
    },
    'zh-CN': {
        'nav.home': '首页',
        'nav.startChatting': '开始咨询',
        'nav.meetTeam': '我们的团队',
        'nav.language': '语言',
        'nav.login': '登录',

        'hero.title': '无论家在何方，你都不孤单',
        'hero.lead':
            '为国际学生提供温暖、懂你文化的情感支持。匿名、安全，随时陪伴你——支持中文和英文。',
        'hero.ctaChat': '开始聊天',
        'hero.ctaCounselors': '认识我们的咨询师',

        'how.title': '使用方式',
        'how.subtitle': '简单三步，从第一句倾诉到与真人咨询师对话。',
        'how.s1.title': '说出你的心事',
        'how.s1.body': '开启一段私密对话——无需注册。随时匿名倾诉，用你最自在的语言。',
        'how.s2.title': '我们懂你的处境',
        'how.s2.body':
            'InnerSun 借助研究国际学生心理健康的学者的专业指导，以温暖且理解文化差异的方式回应你。',
        'how.s3.title': '连接真人咨询师',
        'how.s3.body': '当你准备好时，我们会帮你联系懂得留学他乡经历的真人咨询师。',

        'why.title': '为什么选择 InnerSun',
        'why.subtitle': '一个真正懂得国际学生处境的陪伴者。',
        'why.v1.title': '为留学生打造',
        'why.v1.body':
            '思乡、文化冲击、学业压力、签证焦虑——InnerSun 理解在异国生活与学习的种种挑战。',
        'why.v2.title': '源于专业研究',
        'why.v2.body':
            '回应基于临床专家撰写的国际学生心理健康指南，而非泛泛而谈的机器人答复。',
        'why.v3.title': '双语 · 全天候',
        'why.v3.body': '支持中英文对话，全天候陪伴——情绪来袭的任何时刻，而不只是工作时间。',

        'map.title': '连接家乡与此刻',
        'map.subtitle':
            '从美国的各所校园，到远在中国及世界各地的家人——InnerSun 让你始终与如家般的支持相连。',
        'map.node.us': '美国',
        'map.node.cn': '中国',

        'trust.t1': '完全匿名',
        'trust.t2': '安全私密',
        'trust.t3': '懂你文化',
        'trust.t4': '随时陪伴',
        'trust.note':
            'InnerSun 提供的是情感支持，而非紧急医疗服务。如果你正处于危机中，请立即联系当地急救服务或危机热线。',

        'cta.title': '准备好倾诉了吗？',
        'cta.text': '免费开始，完全匿名。',
        'cta.chat': '开始聊天',
        'cta.human': '联系真人咨询师',

        'team.title': '我们的团队',
        'team.sample': '示例内容——此处为预览用的占位资料与照片，真实团队成员即将上线。',

        'footer.tagline': '面向国际学生的 AI 心理咨询助手',
        'footer.contact': '联系我们',
        'footer.emailLabel': '邮箱',
        'footer.links': '链接',
        'footer.privacy': '隐私政策',
        'footer.terms': '服务条款',
        'footer.rights': '保留所有权利。',

        'chat.heading': '有什么可以帮你的吗？',
        'chat.placeholder': '给 InnerSun 发消息',
        'chat.send': '发送',

        'login.title': '登录',
        'login.email': '邮箱',
        'login.password': '密码',
        'login.remember': '记住我',
        'login.submit': '登录',
    },
};

export const DEFAULT_LOCALE = 'en';

export const AVAILABLE_LOCALES = [
    { code: 'en', label: 'English' },
    { code: 'zh-CN', label: '简体中文' },
];
