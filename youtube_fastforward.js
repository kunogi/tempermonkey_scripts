// ==UserScript==
// @name         YouTube视频增强：屏蔽原生快进，长按3倍速
// @namespace    https://github.com/kunogi
// @version      1.4
// @description  拦截YouTube原生快进，实现长按3倍速，松开即恢复
// @author       Kunogi
// @match        *://www.youtube.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const LONG_PRESS_DELAY = 300;
    const SEEK_TIME = 5;
    const SPEED_DURING_HOLD = 3;

    let isLongPressActive = false;
    let longPressTimer = null;
    let originalRate = 1;

    // 强制屏蔽函数：通过立即停止冒泡和阻止默认行为
    function killEvent(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    }

    function handleKeyDown(e) {
        if (e.key !== 'ArrowRight') return;
        if (e.target.closest('input, textarea, [contenteditable="true"]')) return;

        // 【关键1】即便不满足重复触发条件，也要先杀掉原生事件
        // YouTube 的 10s 快进通常就在这一步被干掉
        killEvent(e);

        if (e.repeat) return;

        let video = document.querySelector('video');
        if (!video) return;

        // 记录按下时的真实速度
        originalRate = video.playbackRate;
        longPressTimer = setTimeout(() => {
            isLongPressActive = true;

            let vArr = document.getElementsByTagName('video');
            for(let i = vArr.length;i--;){
                vArr[i].playbackRate = SPEED_DURING_HOLD;
            }
            console.log("进入加速状态:", SPEED_DURING_HOLD);
        }, LONG_PRESS_DELAY);
    }

    function handleKeyUp(e) {
        if (e.key !== 'ArrowRight') return;
        if (e.target.closest('input, textarea, [contenteditable="true"]')) return;

        // 【关键2】KeyUp 也要拦截，防止某些逻辑在弹起时触发
        killEvent(e);

        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        const video = document.querySelector('video');
        if (!video) return;

        if (isLongPressActive) {
            // 结束长按：强制恢复到按下之前的速度
            let vArr = document.getElementsByTagName('video');
            for(let i = vArr.length;i--;){
                vArr[i].playbackRate = originalRate;
            }
            isLongPressActive = false;
            console.log("恢复速度至:", originalRate);
        } else {
            // 执行短按：快进
            video.currentTime += SEEK_TIME;
        }
    }

    // 在捕获阶段（true）监听，确保在 YouTube 逻辑之前抢到控制权
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

})();
