/* 首帧启动层（解析阶段同步执行，先于浏览器首次绘制）
 *
 * 为什么是外部文件而不是内联 <script>：MV3 扩展页面的 CSP 禁止内联脚本，
 * 而这里必须在解析阶段同步读到 localStorage 并上色——不带 defer/async 的经典脚本是解析阻塞的，
 * 正好满足「首次绘制之前执行」这个时机。放在 <head> 里、样式表之前。
 *
 * 它还负责铺一层最小兜底样式：开发模式（Vite）的 CSS 由 JS 注入，页面首帧完全没有样式表，
 * 不兜底就是纯白底；生产构建的样式表虽然会被解析阻塞加载，但下载期间同样是白屏。
 *
 * 只负责底色：壁纸是几 MB 的 dataURL，同步链路拿不到，硬铺一张缩略图会让整页先糊一下；
 * 壁纸改为在挂载界面之前读出来并解码（见 src/app/wallpaper-preload.ts），首个画面就是它。
 *
 * 与 src/app/boot-theme.ts 共用同一个存储键，键名改动要同步两处。
 */
(function () {
  var html = document.documentElement;

  /* 最小兜底：铺满、无滚动、底色先按深色给（避免白闪），字体等正式样式表到了再接管。
     这段样式与 prototype.css 的 html/body 规则同源，正式样式表加载后会覆盖同权重规则 */
  var style = document.createElement('style');
  style.textContent =
    'html{background-color:#10151b}' +
    'html,body{margin:0;padding:0;height:100%;overflow:hidden}' +
    'body,#root{background-color:transparent}';
  (document.head || html).appendChild(style);

  try {
    var bg = localStorage.getItem('thrilled:boot:bg');
    if (bg) html.style.backgroundColor = bg;
  } catch (e) {
    /* 存储不可用：保持上面的兜底底色 */
  }
})();
