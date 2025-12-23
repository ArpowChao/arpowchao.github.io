document.addEventListener('DOMContentLoaded', () => {
    // 選取所有 href 屬性為 "#" 的 a 標籤按鈕
    const placeholderButtons = document.querySelectorAll('a.btn[href="#"], a.ghost-btn[href="#"]');

    placeholderButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            // 防止點擊後頁面跳轉
            event.preventDefault(); 
            
            // 顯示提示訊息
            alert('這個專案還在施工中！');
        });
    });
});