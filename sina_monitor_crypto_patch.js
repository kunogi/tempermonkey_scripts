// ==UserScript==
// @name         Sina Finance BTC Patch & Ultimate Blocker (Stable)
// @namespace    https://github.com/kunogi
// @version      1.7
// @description  Comprehensive blocker for Sentry, SUDA, DMP, Grafana and internal errors.
// @author       Kunogi
// @match        https://finance.sina.com.cn/temp/m/html/index.html*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {

//https://finance.sina.com.cn/temp/m/html/index.html?symbols=sh000001,sz159915,sh510300,hf_CHA50CFD,sh204001,sh600900,rt_hkHSI,rt_hk01024,rt_hk00700,gb_$ixic,gb_$inx,gb_nvda,gb_pdd,hf_CL,hf_GC,hf_XAG,btc_btcbtcusd,btc_btcethusd,btc_btcdogeusdt,btc_btcbnbusd,btc_btcsolusd,btc_btclinkusdt,btc_btcxautusdt,fx_susdcnh,fx_susdcny

    'use strict';

    // --- 1. 定义全量屏蔽名单 ---
    const BLOCKED_KEYWORDS = [
        'aa.sinajs.cn',            // 不存在的行情接口
        '10.41.42.105',            // Sentry 内网 IP
        'grafana.bip.sina.com.cn', // 内部监控面板
        'bundle.tracing.min.js',   // Sentry SDK
        'suda_log.min.js',         // SUDA 统计脚本
        'r.dmp.sina.cn',           // DMP 广告/数据采集
        'sinaads_ck_wap.js'        // 广告相关 Cookie 检查
    ];

    // 无害的空数据链接
    const EMPTY_JS = 'data:text/javascript;base64,IA==';

    // --- 2. 深度伪装环境，防止后续业务脚本因缺少对象而崩溃 ---
    const noop = () => {};

    // 伪装 Sentry
    if (!window.Sentry) {
        window.Sentry = {
            init: noop, captureException: noop, captureMessage: noop,
            addBreadcrumb: noop, configureScope: noop, withScope: noop,
            setUser: noop, setTag: noop, forceLoad: noop, onLoad: noop,
            flush: () => Promise.resolve(true), close: () => Promise.resolve(true),
            Integrations: { BrowserTracing: function() { return {}; }, Replay: function() { return {}; } }
        };
    }

    // 伪装 SUDA (防止某些逻辑调用 window.suda)
    if (!window.suda) {
        window.suda = { log: noop, track: noop, getCookie: () => "" };
    }

    // --- 3. 核心拦截引擎 (DOM / Fetch / XHR) ---

    // 拦截脚本和框架插入
    const originalCreateElement = document.createElement;
    document.createElement = function (tagName) {
        const element = originalCreateElement.apply(this, arguments);
        const tag = tagName.toLowerCase();

        if (tag === 'script' || tag === 'iframe') {
            const originalSetAttribute = element.setAttribute;

            const handleUrl = (url) => {
                if (typeof url === 'string' && BLOCKED_KEYWORDS.some(k => url.includes(k))) {
                    console.log(`🛡️ [Blocker] Prevented ${tag} loading: ${url.split('?')[0]}`);
                    return tag === 'script' ? EMPTY_JS : 'about:blank';
                }
                return url;
            };

            Object.defineProperty(element, 'src', {
                set: (v) => element.setAttribute('src', handleUrl(v)),
                get: () => element.getAttribute('src'),
                configurable: true
            });

            element.setAttribute = function (name, value) {
                if (name.toLowerCase() === 'src') {
                    value = handleUrl(value);
                }
                return originalSetAttribute.call(this, name, value);
            };
        }
        return element;
    };

    // 拦截 Fetch
    if (window.fetch) {
        const originalFetch = window.fetch;
        window.fetch = function (input, init) {
            const url = typeof input === 'string' ? input : (input.url || '');
            if (typeof url === 'string' && BLOCKED_KEYWORDS.some(k => url.includes(k))) {
                console.log(`🛡️ [Blocker] Silenced fetch: ${url.split('?')[0]}`);
                return Promise.resolve(new Response(null, { status: 204, statusText: 'No Content' }));
            }
            return originalFetch.apply(this, arguments);
        };
    }

    // 拦截 XMLHttpRequest
    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function (m, url) {
        if (typeof url === 'string' && BLOCKED_KEYWORDS.some(k => url.includes(k))) {
            console.log(`🛡️ [Blocker] Silenced XHR: ${url.split('?')[0]}`);
            return;
        }
        return originalXHR.apply(this, arguments);
    };

    // --- 4. KKE.api 业务补丁逻辑 ---

    const PATCHED_SYMBOL = Symbol('btc_patched');

    function createPatchedApi(originalApi) {
        return function(command, options, callback) {
            // BTC 相关行情修正
            if (options?.symbol?.startsWith('btc_') && command === 'chart.h5t.get') {
                command = 'chart.h5k.get';
                options.view = 'k1';
                options.nfloat = 4;
                console.log('✅ [BTC] Patched %s', options.symbol);
            }
            return originalApi.call(this, command, options, callback);
        };
    }

    const kkeHandler = {
        set(target, prop, value) {
            if (prop === 'api' && typeof value === 'function' && !target[PATCHED_SYMBOL]) {
                console.log('🔒 [BTC] Patching KKE.api...');
                target[PATCHED_SYMBOL] = true;
                target.api = createPatchedApi(value);
                return true;
            }
            target[prop] = value;
            return true;
        },
        get(target, prop) {
            if (prop === 'api') return target.api;
            return target[prop];
        }
    };

    let kkeProxy = new Proxy({}, kkeHandler);

    try {
        Object.defineProperty(window, 'KKE', {
            configurable: true,
            enumerable: true,
            get() { return kkeProxy; },
            set(v) {
                if (v && !v[PATCHED_SYMBOL]) {
                    kkeProxy = new Proxy(v, kkeHandler);
                } else {
                    kkeProxy = v;
                }
            }
        });
    } catch (e) {
        window.KKE = kkeProxy;
    }

    // 持续轮询，确保在极端渲染情况下补丁不丢失
    setInterval(() => {
        if (window.KKE && typeof window.KKE.api === 'function' && !window.KKE[PATCHED_SYMBOL]) {
            const orig = window.KKE.api;
            window.KKE.api = createPatchedApi(orig);
            window.KKE[PATCHED_SYMBOL] = true;
        }
    }, 500);

})();
