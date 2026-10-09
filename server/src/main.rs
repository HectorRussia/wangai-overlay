use wangai_server::{config::Config, metrics, router, Gateway};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if let Some(path) = std::env::var_os("WANGAI_SERVER_ENV_FILE") {
        // An explicitly selected file must load successfully; never fall back to cloud credentials.
        dotenvy::from_path_override(path)?;
    } else {
        dotenvy::dotenv().ok();
    }
    if std::env::args().nth(1).as_deref() == Some("usage") {
        return metrics::summary(
            &std::env::var("DATABASE_PATH").unwrap_or_else(|_| "usage.sqlite3".into()),
        );
    }
    let config = Config::from_env()?;
    let listener = tokio::net::TcpListener::bind(&config.bind).await?;
    let state = Gateway::new(config)?;
    println!("WANGAI gateway listening on {}", listener.local_addr()?);
    axum::serve(listener, router(state.clone()))
        .with_graceful_shutdown(shutdown())
        .await?;
    state.flush_metrics().await;
    Ok(())
}

async fn shutdown() {
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("SIGTERM");
        tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = term.recv() => {} }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
