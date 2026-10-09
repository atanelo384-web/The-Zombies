.class public Lcom/bolupy/thezombies/MainActivity;
.super Landroid/app/Activity;
.source "MainActivity.smali"

# The Zombies — tiny Android shell: a fullscreen WebView that serves the game
# from the APK assets at http://localhost/ (a secure context, so the microphone works).

.field private web:Landroid/webkit/WebView;

.method public constructor <init>()V
    .registers 1
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V
    return-void
.end method

.method private immersive()V
    .registers 3
    iget-object v0, p0, Lcom/bolupy/thezombies/MainActivity;->web:Landroid/webkit/WebView;
    if-eqz v0, :done
    const/16 v1, 0x1706
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->setSystemUiVisibility(I)V
    :done
    return-void
.end method

.method protected onCreate(Landroid/os/Bundle;)V
    .registers 8
    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    invoke-virtual {p0}, Lcom/bolupy/thezombies/MainActivity;->getWindow()Landroid/view/Window;
    move-result-object v0
    const/16 v1, 0x480
    invoke-virtual {v0, v1}, Landroid/view/Window;->addFlags(I)V

    new-instance v0, Landroid/webkit/WebView;
    invoke-direct {v0, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V
    iput-object v0, p0, Lcom/bolupy/thezombies/MainActivity;->web:Landroid/webkit/WebView;

    invoke-virtual {v0}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;
    move-result-object v1
    const/4 v2, 0x1
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDatabaseEnabled(Z)V
    const/4 v3, 0x0
    invoke-virtual {v1, v3}, Landroid/webkit/WebSettings;->setMediaPlaybackRequiresUserGesture(Z)V
    invoke-virtual {v1, v3}, Landroid/webkit/WebSettings;->setMixedContentMode(I)V
    invoke-virtual {v1}, Landroid/webkit/WebSettings;->getUserAgentString()Ljava/lang/String;
    move-result-object v3
    const-string v4, " TheZombiesApp/4.1"
    invoke-virtual {v3, v4}, Ljava/lang/String;->concat(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v3
    invoke-virtual {v1, v3}, Landroid/webkit/WebSettings;->setUserAgentString(Ljava/lang/String;)V

    invoke-virtual {p0}, Lcom/bolupy/thezombies/MainActivity;->getAssets()Landroid/content/res/AssetManager;
    move-result-object v2
    new-instance v1, Lcom/bolupy/thezombies/AssetClient;
    invoke-direct {v1, v2}, Lcom/bolupy/thezombies/AssetClient;-><init>(Landroid/content/res/AssetManager;)V
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V

    new-instance v1, Lcom/bolupy/thezombies/Chrome;
    invoke-direct {v1}, Lcom/bolupy/thezombies/Chrome;-><init>()V
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->setWebChromeClient(Landroid/webkit/WebChromeClient;)V

    const/high16 v1, -0x1000000
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->setBackgroundColor(I)V
    invoke-virtual {p0, v0}, Lcom/bolupy/thezombies/MainActivity;->setContentView(Landroid/view/View;)V
    invoke-direct {p0}, Lcom/bolupy/thezombies/MainActivity;->immersive()V

    const/4 v1, 0x1
    new-array v2, v1, [Ljava/lang/String;
    const-string v3, "android.permission.RECORD_AUDIO"
    const/4 v4, 0x0
    aput-object v3, v2, v4
    invoke-virtual {p0, v2, v1}, Lcom/bolupy/thezombies/MainActivity;->requestPermissions([Ljava/lang/String;I)V

    const-string v1, "http://localhost/index.html"
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V
    return-void
.end method

.method protected onResume()V
    .registers 2
    invoke-super {p0}, Landroid/app/Activity;->onResume()V
    iget-object v0, p0, Lcom/bolupy/thezombies/MainActivity;->web:Landroid/webkit/WebView;
    if-eqz v0, :done
    invoke-virtual {v0}, Landroid/webkit/WebView;->onResume()V
    invoke-direct {p0}, Lcom/bolupy/thezombies/MainActivity;->immersive()V
    :done
    return-void
.end method

.method protected onPause()V
    .registers 2
    iget-object v0, p0, Lcom/bolupy/thezombies/MainActivity;->web:Landroid/webkit/WebView;
    if-eqz v0, :done
    invoke-virtual {v0}, Landroid/webkit/WebView;->onPause()V
    :done
    invoke-super {p0}, Landroid/app/Activity;->onPause()V
    return-void
.end method

.method public onWindowFocusChanged(Z)V
    .registers 2
    invoke-super {p0, p1}, Landroid/app/Activity;->onWindowFocusChanged(Z)V
    if-eqz p1, :done
    invoke-direct {p0}, Lcom/bolupy/thezombies/MainActivity;->immersive()V
    :done
    return-void
.end method

.method public onBackPressed()V
    .registers 4
    iget-object v0, p0, Lcom/bolupy/thezombies/MainActivity;->web:Landroid/webkit/WebView;
    if-eqz v0, :done
    const-string v1, "window.tzBack&&window.tzBack()"
    const/4 v2, 0x0
    invoke-virtual {v0, v1, v2}, Landroid/webkit/WebView;->evaluateJavascript(Ljava/lang/String;Landroid/webkit/ValueCallback;)V
    :done
    return-void
.end method
