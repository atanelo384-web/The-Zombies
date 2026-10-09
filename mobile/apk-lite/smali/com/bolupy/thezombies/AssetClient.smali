.class public Lcom/bolupy/thezombies/AssetClient;
.super Landroid/webkit/WebViewClient;
.source "AssetClient.smali"

# serves files from assets/www for http://localhost/... ; everything else goes to the network

.field private am:Landroid/content/res/AssetManager;

.method public constructor <init>(Landroid/content/res/AssetManager;)V
    .registers 2
    invoke-direct {p0}, Landroid/webkit/WebViewClient;-><init>()V
    iput-object p1, p0, Lcom/bolupy/thezombies/AssetClient;->am:Landroid/content/res/AssetManager;
    return-void
.end method

.method private static mime(Ljava/lang/String;)Ljava/lang/String;
    .registers 2
    const-string v0, ".js"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :m0
    const-string v0, "text/javascript"
    return-object v0
    :m0
    const-string v0, ".css"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :m1
    const-string v0, "text/css"
    return-object v0
    :m1
    const-string v0, ".html"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :m2
    const-string v0, "text/html"
    return-object v0
    :m2
    const-string v0, ".png"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :m3
    const-string v0, "image/png"
    return-object v0
    :m3
    const-string v0, ".woff2"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :m4
    const-string v0, "font/woff2"
    return-object v0
    :m4
    const-string v0, ".woff"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :m5
    const-string v0, "font/woff"
    return-object v0
    :m5
    const-string v0, ".ttf"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :m6
    const-string v0, "font/ttf"
    return-object v0
    :m6
    const-string v0, ".webmanifest"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :m7
    const-string v0, "application/manifest+json"
    return-object v0
    :m7
    const-string v0, ".json"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :m8
    const-string v0, "application/json"
    return-object v0
    :m8
    const-string v0, ".mp3"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :m9
    const-string v0, "audio/mpeg"
    return-object v0
    :m9
    const-string v0, ".ogg"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :m10
    const-string v0, "audio/ogg"
    return-object v0
    :m10
    const-string v0, ".svg"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :m11
    const-string v0, "image/svg+xml"
    return-object v0
    :m11
    const-string v0, ".txt"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :m12
    const-string v0, "text/plain"
    return-object v0
    :m12
    const-string v0, ".ico"
    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z
    move-result v0
    if-eqz v0, :m13
    const-string v0, "image/x-icon"
    return-object v0
    :m13
    const-string v0, "application/octet-stream"
    return-object v0
.end method

.method public shouldInterceptRequest(Landroid/webkit/WebView;Landroid/webkit/WebResourceRequest;)Landroid/webkit/WebResourceResponse;
    .registers 9
    invoke-interface {p2}, Landroid/webkit/WebResourceRequest;->getUrl()Landroid/net/Uri;
    move-result-object v0
    invoke-virtual {v0}, Landroid/net/Uri;->getHost()Ljava/lang/String;
    move-result-object v1
    const-string v2, "localhost"
    invoke-virtual {v2, v1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z
    move-result v1
    if-eqz v1, :none
    invoke-virtual {v0}, Landroid/net/Uri;->getPath()Ljava/lang/String;
    move-result-object v1
    if-eqz v1, :index
    const-string v2, "/"
    invoke-virtual {v1, v2}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z
    move-result v2
    if-eqz v2, :have
    :index
    const-string v1, "/index.html"
    :have
    const/4 v2, 0x1
    invoke-virtual {v1, v2}, Ljava/lang/String;->substring(I)Ljava/lang/String;
    move-result-object v1
    invoke-static {v1}, Lcom/bolupy/thezombies/AssetClient;->mime(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v3
    const-string v4, "www/"
    invoke-virtual {v4, v1}, Ljava/lang/String;->concat(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v4
    iget-object v2, p0, Lcom/bolupy/thezombies/AssetClient;->am:Landroid/content/res/AssetManager;
    :try_start
    invoke-virtual {v2, v4}, Landroid/content/res/AssetManager;->open(Ljava/lang/String;)Ljava/io/InputStream;
    move-result-object v4
    :try_end
    .catch Ljava/io/IOException; {:try_start .. :try_end} :none
    new-instance v5, Landroid/webkit/WebResourceResponse;
    const-string v2, "UTF-8"
    invoke-direct {v5, v3, v2, v4}, Landroid/webkit/WebResourceResponse;-><init>(Ljava/lang/String;Ljava/lang/String;Ljava/io/InputStream;)V
    return-object v5
    :none
    const/4 v0, 0x0
    return-object v0
.end method
