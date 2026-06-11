// functions/api/submit.js

async function sendToWeCom(webhookUrl, { name, phone, email, message }) {
    if (!webhookUrl) {
        throw new Error('企业微信 Webhook URL 未配置');
    }

    let content = `## 📋 嬴麓国际 新留言通知\n> **姓名：** ${name}\n> **电话：** ${phone}\n> **邮箱：** ${email || '未填写'}\n> **留言内容：** \n> ${message || '无'}`;
    
    if (new TextEncoder().encode(content).length > 3800) {
        const truncated = message ? message.slice(0, 3500) : '';
        content = `## 📋 嬴麓国际 新留言通知\n> **姓名：** ${name}\n> **电话：** ${phone}\n> **邮箱：** ${email || '未填写'}\n> **留言内容：** \n> ${truncated}\n> ...(内容过长已截断)`;
    }

    const payload = {
        msgtype: 'markdown',
        markdown: { content }
    };

    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (result.errcode !== 0) {
        throw new Error(`企业微信发送失败: ${result.errmsg} (errcode: ${result.errcode})`);
    }
    return result;
}

export async function onRequestPost(context) {
    const { request, env } = context;

    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }

    try {
        const { name, phone, email, message, turnstileToken } = await request.json();

        // 1. 验证 Turnstile
        if (!env.TURNSTILE_SECRET_KEY) {
            throw new Error('Turnstile 密钥未配置');
        }
        const turnstileUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
        const turnstileResult = await fetch(turnstileUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret: env.TURNSTILE_SECRET_KEY,
                response: turnstileToken,
            }),
        });
        const turnstileOutcome = await turnstileResult.json();

        if (!turnstileOutcome.success) {
            console.error('Turnstile 验证失败', turnstileOutcome);
            return new Response(JSON.stringify({ success: false, message: '验证失败，请刷新页面重试' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        }

        // 2. 发送企业微信通知（使用确定的环境变量名）
        if (!env.WECOM_WEBHOOK_URL) {
            throw new Error('WECOM_WEBHOOK_URL 环境变量未设置');
        }
        await sendToWeCom(env.WECOM_WEBHOOK_URL, { name, phone, email, message });

        // 3. 返回成功
        return new Response(JSON.stringify({ success: true, message: '留言已发送！' }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });

    } catch (error) {
        console.error('处理请求出错:', error.message);
        let userMessage = '服务器错误，请稍后重试';
        if (error.message.includes('企业微信发送失败')) {
            userMessage = '通知发送失败，请联系管理员';
        } else if (error.message.includes('Turnstile')) {
            userMessage = '验证服务异常';
        }
        return new Response(JSON.stringify({ success: false, message: userMessage }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
}