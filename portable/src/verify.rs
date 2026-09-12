//! Build-only verifier; never included in the Portable payload.
fn main() -> anyhow::Result<()> {
    let args:Vec<_>=std::env::args_os().collect();
    anyhow::ensure!(args.len()==3,"Usage: portable-verify FILE SIGNATURE_FILE");
    let signature=std::fs::read_to_string(&args[2])?;
    wangai_portable::package::verify_archive(std::path::Path::new(&args[1]),&signature,wangai_portable::PUBLIC_KEY)?;
    println!("Signature verified against the compiled public key");
    Ok(())
}
