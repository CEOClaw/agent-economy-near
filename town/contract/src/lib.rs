//! AgentProof anchor + acceptance gate on NEAR testnet. Zero dependencies; every host call is declared below.
//!   record({"job_id","digest","checker_version"})   owner only; write-once digest anchor (v1, unchanged)
//!   get({"job_id"})                                  view; the anchor JSON or null (v1, unchanged)
//!   record_decision({job_id,delivery_digest,checker_version,verdict,action,buyer_owner,seller_owner})
//!                                                    owner only; the gate: the verdict/action pairing and the
//!                                                    redelivery history are enforced here, in code
//!   get_decisions({"job_id"})                        view; JSON array of the job's decisions, oldest first
//!   list({"from":N,"limit":N})                       view; JSON array of decisions in global record order, limit 1..10
//!
//! Storage key spaces (a v1 key is a bare job_id, [0-9a-f-]{1,64}, so every new key holds a ':' or is "gn",
//! and none can ever equal a job_id):
//!   <job_id>        v1 anchor record JSON                      (untouched)
//!   d:<job_id>:<n>  decision record JSON, n = 0..15
//!   m:<job_id>      digest(64 hex) + settled flag ('0'|'1') + decision count (decimal): the job's history head
//!   g:<i>           "<job_id>:<n>", i = global record order
//!   gn              total decisions recorded (decimal)
#![cfg_attr(not(test), no_std)]

use core::ptr::{addr_of, addr_of_mut};

#[cfg(not(test))]
mod host {
    extern "C" {
        pub fn input(register_id: u64);
        pub fn register_len(register_id: u64) -> u64;
        pub fn read_register(register_id: u64, ptr: u64);
        pub fn predecessor_account_id(register_id: u64);
        pub fn current_account_id(register_id: u64);
        pub fn storage_read(key_len: u64, key_ptr: u64, register_id: u64) -> u64;
        pub fn storage_write(key_len: u64, key_ptr: u64, value_len: u64, value_ptr: u64, register_id: u64) -> u64;
        pub fn storage_has_key(key_len: u64, key_ptr: u64) -> u64;
        pub fn value_return(value_len: u64, value_ptr: u64);
        pub fn panic_utf8(len: u64, ptr: u64) -> !;
        pub fn block_index() -> u64;
        pub fn block_timestamp() -> u64;
    }
}
use host::*;

#[cfg(not(test))]
#[panic_handler]
fn on_panic(_: &core::panic::PanicInfo) -> ! {
    fail(b"contract panic")
}

fn fail(msg: &[u8]) -> ! {
    unsafe { panic_utf8(msg.len() as u64, msg.as_ptr() as u64) }
}

// wasm is single-threaded: plain static buffers, no allocator.
static mut ARGS: [u8; 1024] = [0; 1024];
static mut ACCT_A: [u8; 128] = [0; 128];
static mut ACCT_B: [u8; 128] = [0; 128];
// 16 max-size decisions are 8.4 KB as JSON (one record is up to ~525 bytes; REC holds 640).
static mut OUT: [u8; 8704] = [0; 8704];
static mut REC: [u8; 640] = [0; 640];
static mut TMP: [u8; 128] = [0; 128];
static mut KEY: [u8; 96] = [0; 96];

/// Copies register `id` into `buf`; panics if it does not fit.
fn load(id: u64, buf: *mut u8, cap: usize) -> usize {
    unsafe {
        let n = register_len(id) as usize;
        if n > cap {
            fail(b"input too large");
        }
        read_register(id, buf as u64);
        n
    }
}

fn skip_ws(a: &[u8], mut i: usize) -> usize {
    while i < a.len() && matches!(a[i], b' ' | b'\t' | b'\n' | b'\r') {
        i += 1;
    }
    i
}

/// A JSON string with no escapes (every allowed value is plain ASCII, so a backslash is invalid).
/// Returns (start, end) of the contents and the index after the closing quote.
fn string(a: &[u8], i: usize) -> ((usize, usize), usize) {
    if i >= a.len() || a[i] != b'"' {
        fail(b"bad json");
    }
    let start = i + 1;
    let mut j = start;
    while j < a.len() && a[j] != b'"' {
        if a[j] == b'\\' {
            fail(b"bad json");
        }
        j += 1;
    }
    if j >= a.len() {
        fail(b"bad json");
    }
    ((start, j), j + 1)
}

/// A JSON integer: 1 to 9 digits, no sign, no fraction, no leading zero.
fn number(a: &[u8], i: usize) -> ((usize, usize), usize) {
    let mut j = i;
    while j < a.len() && a[j].is_ascii_digit() {
        j += 1;
    }
    if j == i || j - i > 9 || (a[i] == b'0' && j - i > 1) {
        fail(b"bad json");
    }
    ((i, j), j)
}

/// Parses a flat object whose values are all strings (`num` false) or all integers (`num` true).
/// Known keys land in `out` by position; unknown keys are allowed, a repeated known key is not.
fn parse_into(a: &[u8], keys: &[&[u8]], out: &mut [Option<(usize, usize)>], num: bool) {
    let mut i = skip_ws(a, 0);
    if i >= a.len() || a[i] != b'{' {
        fail(b"bad json");
    }
    i = skip_ws(a, i + 1);
    if i < a.len() && a[i] == b'}' && skip_ws(a, i + 1) == a.len() {
        return;
    }
    loop {
        let ((ks, ke), n) = string(a, skip_ws(a, i));
        i = skip_ws(a, n);
        if i >= a.len() || a[i] != b':' {
            fail(b"bad json");
        }
        let vi = skip_ws(a, i + 1);
        let (v, n) = if num { number(a, vi) } else { string(a, vi) };
        if let Some(k) = keys.iter().position(|k| *k == &a[ks..ke]) {
            if out[k].is_some() {
                fail(b"bad json");
            }
            out[k] = Some(v);
        }
        i = skip_ws(a, n);
        if i < a.len() && a[i] == b',' {
            i += 1;
            continue;
        }
        if i < a.len() && a[i] == b'}' && skip_ws(a, i + 1) == a.len() {
            return;
        }
        fail(b"bad json");
    }
}

fn len_ok(v: &[u8], max: usize) -> bool {
    !v.is_empty() && v.len() <= max
}
fn job_id_ok(v: &[u8]) -> bool {
    len_ok(v, 64) && v.iter().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(c) || *c == b'-')
}
fn digest_ok(v: &[u8]) -> bool {
    v.len() == 64 && v.iter().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(c))
}
fn version_ok(v: &[u8]) -> bool {
    len_ok(v, 64) && v.iter().all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'_' | b':' | b'-'))
}
fn owner_ok(v: &[u8]) -> bool {
    len_ok(v, 64) && v.iter().all(|c| c.is_ascii_digit() || c.is_ascii_lowercase())
}

/// The gate's pairing table: pass -> accept; fail -> request_changes | cancel; blocked -> none | cancel.
fn pairing_ok(verdict: &[u8], action: &[u8]) -> bool {
    match verdict {
        b"pass" => action == b"accept",
        b"fail" => action == b"request_changes" || action == b"cancel",
        _ => action == b"none" || action == b"cancel",
    }
}

/// Appends to a static buffer; overflow panics instead of writing past it.
struct Writer {
    buf: *mut u8,
    cap: usize,
    n: usize,
}
impl Writer {
    fn on(buf: *mut u8, cap: usize) -> Writer {
        Writer { buf, cap, n: 0 }
    }
    fn out() -> Writer {
        Writer::on(addr_of_mut!(OUT) as *mut u8, 8704)
    }
    fn put(&mut self, s: &[u8]) {
        if self.n + s.len() > self.cap {
            fail(b"output too large");
        }
        unsafe { core::slice::from_raw_parts_mut(self.buf.add(self.n), s.len()).copy_from_slice(s) };
        self.n += s.len();
    }
    fn num(&mut self, mut v: u64) {
        let mut tmp = [0u8; 20];
        let mut k = tmp.len();
        loop {
            k -= 1;
            tmp[k] = b'0' + (v % 10) as u8;
            v /= 10;
            if v == 0 {
                break;
            }
        }
        self.put(&tmp[k..]);
    }
    fn bytes(&self) -> &'static [u8] {
        unsafe { core::slice::from_raw_parts(self.buf, self.n) }
    }
}

fn dec(v: &[u8]) -> u64 {
    v.iter().fold(0u64, |acc, c| acc * 10 + (c - b'0') as u64)
}

fn args_slice() -> &'static [u8] {
    unsafe {
        input(0);
        let n = load(0, addr_of_mut!(ARGS) as *mut u8, 1024);
        &(&*addr_of!(ARGS))[..n]
    }
}

fn only_owner() {
    unsafe {
        predecessor_account_id(1);
        let pa = load(1, addr_of_mut!(ACCT_A) as *mut u8, 128);
        current_account_id(2);
        let ca = load(2, addr_of_mut!(ACCT_B) as *mut u8, 128);
        if (&*addr_of!(ACCT_A))[..pa] != (&*addr_of!(ACCT_B))[..ca] {
            fail(b"only the owner can record");
        }
    }
}

/// Builds a storage key in the static KEY buffer: the parts, then an optional decimal. Valid until the next call.
fn mkkey(parts: &[&[u8]], n: Option<u64>) -> &'static [u8] {
    let mut w = Writer::on(addr_of_mut!(KEY) as *mut u8, 96);
    for p in parts {
        w.put(p);
    }
    if let Some(v) = n {
        w.num(v);
    }
    w.bytes()
}

fn read_key(key: &[u8], buf: *mut u8, cap: usize) -> Option<usize> {
    unsafe {
        if storage_read(key.len() as u64, key.as_ptr() as u64, 0) == 1 {
            Some(load(0, buf, cap))
        } else {
            None
        }
    }
}

fn write_key(key: &[u8], val: &[u8]) {
    unsafe {
        storage_write(key.len() as u64, key.as_ptr() as u64, val.len() as u64, val.as_ptr() as u64, 0);
    }
}

fn tmp_ptr() -> *mut u8 {
    addr_of_mut!(TMP) as *mut u8
}
fn tmp(n: usize) -> &'static [u8] {
    unsafe { &(&*addr_of!(TMP))[..n] }
}

/// The job's history head: (count, settled, digest equals `digest`). (0, false, false) for a job with no decisions.
fn head(job_id: &[u8], digest: &[u8]) -> (u64, bool, bool) {
    match read_key(mkkey(&[b"m:", job_id], None), tmp_ptr(), 128) {
        Some(n) => {
            let t = tmp(n);
            (dec(&t[65..]), t[64] == b'1', &t[..64] == digest)
        }
        None => (0, false, false),
    }
}

fn total() -> u64 {
    match read_key(b"gn", tmp_ptr(), 128) {
        Some(n) => dec(tmp(n)),
        None => 0,
    }
}

/// Appends the stored decision `d:<job_id>:<n>` to `w`.
fn put_decision(w: &mut Writer, job_id: &[u8], n: u64) {
    let key = mkkey(&[b"d:", job_id, b":"], Some(n));
    let Some(len) = read_key(key, addr_of_mut!(REC) as *mut u8, 640) else { fail(b"missing decision") };
    w.put(unsafe { &(&*addr_of!(REC))[..len] });
}

fn finish(w: &Writer) {
    unsafe { value_return(w.n as u64, w.buf as u64) }
}

fn do_record() {
    only_owner();
    let a = args_slice();
    let mut s = [None; 3];
    parse_into(a, &[b"job_id", b"digest", b"checker_version"], &mut s, false);
    let [Some(j), Some(d), Some(c)] = s else { fail(b"missing field") };
    let (job_id, digest, ver) = (&a[j.0..j.1], &a[d.0..d.1], &a[c.0..c.1]);
    if !job_id_ok(job_id) {
        fail(b"bad job_id");
    }
    if !digest_ok(digest) {
        fail(b"bad digest");
    }
    if !version_ok(ver) {
        fail(b"bad checker_version");
    }
    unsafe {
        if storage_has_key(job_id.len() as u64, job_id.as_ptr() as u64) == 1 {
            fail(b"already recorded");
        }
        let mut w = Writer::out();
        w.put(b"{\"job_id\":\"");
        w.put(job_id);
        w.put(b"\",\"digest\":\"");
        w.put(digest);
        w.put(b"\",\"checker_version\":\"");
        w.put(ver);
        w.put(b"\",\"block_height\":");
        w.num(block_index());
        w.put(b",\"block_timestamp_ms\":");
        w.num(block_timestamp() / 1_000_000);
        w.put(b"}");
        write_key(job_id, w.bytes());
        finish(&w);
    }
}

fn do_get() {
    let a = args_slice();
    let mut s = [None; 1];
    parse_into(a, &[b"job_id"], &mut s, false);
    let Some(j) = s[0] else { fail(b"missing field") };
    let job_id = &a[j.0..j.1];
    if !job_id_ok(job_id) {
        fail(b"bad job_id");
    }
    match read_key(job_id, addr_of_mut!(OUT) as *mut u8, 768) {
        Some(n) => unsafe { value_return(n as u64, addr_of!(OUT) as u64) },
        None => unsafe { value_return(4, b"null".as_ptr() as u64) },
    }
}

fn do_record_decision() {
    only_owner();
    let a = args_slice();
    let mut s = [None; 7];
    let keys: [&[u8]; 7] =
        [b"job_id", b"delivery_digest", b"checker_version", b"verdict", b"action", b"buyer_owner", b"seller_owner"];
    parse_into(a, &keys, &mut s, false);
    let mut f: [&[u8]; 7] = [b""; 7];
    for i in 0..7 {
        let Some(r) = s[i] else { fail(b"missing field") };
        f[i] = &a[r.0..r.1];
    }
    let [job_id, digest, ver, verdict, action, buyer, seller] = f;
    if !job_id_ok(job_id) {
        fail(b"bad job_id");
    }
    if !digest_ok(digest) {
        fail(b"bad delivery_digest");
    }
    if !version_ok(ver) {
        fail(b"bad checker_version");
    }
    if !matches!(verdict, b"pass" | b"fail" | b"blocked") {
        fail(b"bad verdict");
    }
    if !matches!(action, b"accept" | b"request_changes" | b"cancel" | b"none") {
        fail(b"bad action");
    }
    if !owner_ok(buyer) {
        fail(b"bad buyer_owner");
    }
    if !owner_ok(seller) {
        fail(b"bad seller_owner");
    }
    if !pairing_ok(verdict, action) {
        fail(b"action not allowed for verdict");
    }
    // History: only a redelivery (a new digest) may follow a decision, and accept/cancel end the job.
    let (n, settled, same) = head(job_id, digest);
    if settled {
        fail(b"job settled");
    }
    if same {
        fail(b"already decided");
    }
    if n >= 16 {
        fail(b"too many decisions");
    }
    let g = total();
    unsafe {
        let mut w = Writer::out();
        w.put(b"{\"job_id\":\"");
        w.put(job_id);
        w.put(b"\",\"n\":");
        w.num(n);
        w.put(b",\"delivery_digest\":\"");
        w.put(digest);
        w.put(b"\",\"checker_version\":\"");
        w.put(ver);
        w.put(b"\",\"verdict\":\"");
        w.put(verdict);
        w.put(b"\",\"action\":\"");
        w.put(action);
        w.put(b"\",\"buyer_owner\":\"");
        w.put(buyer);
        w.put(b"\",\"seller_owner\":\"");
        w.put(seller);
        w.put(b"\",\"block_height\":");
        w.num(block_index());
        w.put(b",\"block_timestamp_ms\":");
        w.num(block_timestamp() / 1_000_000);
        w.put(b"}");
        write_key(mkkey(&[b"d:", job_id, b":"], Some(n)), w.bytes());

        let mut m = Writer::on(tmp_ptr(), 128);
        m.put(digest);
        m.put(if action == b"accept" || action == b"cancel" { b"1" } else { b"0" });
        m.num(n + 1);
        write_key(mkkey(&[b"m:", job_id], None), m.bytes());

        let mut e = Writer::on(tmp_ptr(), 128);
        e.put(job_id);
        e.put(b":");
        e.num(n);
        write_key(mkkey(&[b"g:"], Some(g)), e.bytes());

        let mut t = Writer::on(tmp_ptr(), 128);
        t.num(g + 1);
        write_key(b"gn", t.bytes());

        finish(&w);
    }
}

fn do_get_decisions() {
    let a = args_slice();
    let mut s = [None; 1];
    parse_into(a, &[b"job_id"], &mut s, false);
    let Some(j) = s[0] else { fail(b"missing field") };
    let job_id = &a[j.0..j.1];
    if !job_id_ok(job_id) {
        fail(b"bad job_id");
    }
    let count = match read_key(mkkey(&[b"m:", job_id], None), tmp_ptr(), 128) {
        Some(n) => dec(&tmp(n)[65..]),
        None => 0,
    };
    let mut w = Writer::out();
    w.put(b"[");
    for i in 0..count {
        if i > 0 {
            w.put(b",");
        }
        put_decision(&mut w, job_id, i);
    }
    w.put(b"]");
    finish(&w);
}

fn do_list() {
    let a = args_slice();
    let mut s = [None; 2];
    parse_into(a, &[b"from", b"limit"], &mut s, true);
    let [Some(f), Some(l)] = s else { fail(b"missing field") };
    let (from, limit) = (dec(&a[f.0..f.1]), dec(&a[l.0..l.1]));
    if !(1..=10).contains(&limit) {
        fail(b"bad limit");
    }
    let end = core::cmp::min(from + limit, total());
    let mut w = Writer::out();
    w.put(b"[");
    let mut i = from;
    while i < end {
        if i > from {
            w.put(b",");
        }
        let Some(n) = read_key(mkkey(&[b"g:"], Some(i)), tmp_ptr(), 128) else { fail(b"missing decision") };
        let e = tmp(n);
        let Some(p) = e.iter().rposition(|c| *c == b':') else { fail(b"missing decision") };
        put_decision(&mut w, &e[..p], dec(&e[p + 1..]));
        i += 1;
    }
    w.put(b"]");
    finish(&w);
}

// Exports. Thin wrappers: a panic inside an extern "C" fn aborts on the host, so tests call the do_* bodies.
#[cfg_attr(not(test), no_mangle)]
pub extern "C" fn record() {
    do_record()
}
#[cfg_attr(not(test), no_mangle)]
pub extern "C" fn get() {
    do_get()
}
#[cfg_attr(not(test), no_mangle)]
pub extern "C" fn record_decision() {
    do_record_decision()
}
#[cfg_attr(not(test), no_mangle)]
pub extern "C" fn get_decisions() {
    do_get_decisions()
}
#[cfg_attr(not(test), no_mangle)]
pub extern "C" fn list() {
    do_list()
}

/// Host mock for `cargo test --target <host>`: the NEAR imports over in-memory state.
#[cfg(test)]
mod host {
    use std::cell::RefCell;
    use std::collections::BTreeMap;

    #[derive(Default)]
    pub struct Mock {
        pub regs: BTreeMap<u64, Vec<u8>>,
        pub store: BTreeMap<Vec<u8>, Vec<u8>>,
        pub input: Vec<u8>,
        pub caller: Vec<u8>,
        pub contract: Vec<u8>,
        pub height: u64,
        pub ts_ns: u64,
        pub ret: Option<Vec<u8>>,
    }
    thread_local! { pub static M: RefCell<Mock> = RefCell::new(Mock::default()); }

    pub unsafe fn input(r: u64) {
        M.with(|m| {
            let mut m = m.borrow_mut();
            let v = m.input.clone();
            m.regs.insert(r, v);
        })
    }
    pub unsafe fn register_len(r: u64) -> u64 {
        M.with(|m| m.borrow().regs.get(&r).map_or(u64::MAX, |v| v.len() as u64))
    }
    pub unsafe fn read_register(r: u64, ptr: u64) {
        M.with(|m| {
            let m = m.borrow();
            let v = &m.regs[&r];
            std::ptr::copy_nonoverlapping(v.as_ptr(), ptr as *mut u8, v.len());
        })
    }
    pub unsafe fn predecessor_account_id(r: u64) {
        M.with(|m| {
            let mut m = m.borrow_mut();
            let v = m.caller.clone();
            m.regs.insert(r, v);
        })
    }
    pub unsafe fn current_account_id(r: u64) {
        M.with(|m| {
            let mut m = m.borrow_mut();
            let v = m.contract.clone();
            m.regs.insert(r, v);
        })
    }
    unsafe fn bytes<'a>(len: u64, ptr: u64) -> &'a [u8] {
        std::slice::from_raw_parts(ptr as *const u8, len as usize)
    }
    pub unsafe fn storage_read(kl: u64, kp: u64, r: u64) -> u64 {
        let key = bytes(kl, kp).to_vec();
        M.with(|m| {
            let mut m = m.borrow_mut();
            match m.store.get(&key).cloned() {
                Some(v) => {
                    m.regs.insert(r, v);
                    1
                }
                None => 0,
            }
        })
    }
    pub unsafe fn storage_write(kl: u64, kp: u64, vl: u64, vp: u64, _r: u64) -> u64 {
        let (k, v) = (bytes(kl, kp).to_vec(), bytes(vl, vp).to_vec());
        M.with(|m| m.borrow_mut().store.insert(k, v).is_some() as u64)
    }
    pub unsafe fn storage_has_key(kl: u64, kp: u64) -> u64 {
        let key = bytes(kl, kp).to_vec();
        M.with(|m| m.borrow().store.contains_key(&key) as u64)
    }
    pub unsafe fn value_return(l: u64, p: u64) {
        let v = bytes(l, p).to_vec();
        M.with(|m| m.borrow_mut().ret = Some(v));
    }
    pub unsafe fn panic_utf8(l: u64, p: u64) -> ! {
        panic!("{}", String::from_utf8_lossy(bytes(l, p)))
    }
    pub unsafe fn block_index() -> u64 {
        M.with(|m| m.borrow().height)
    }
    pub unsafe fn block_timestamp() -> u64 {
        M.with(|m| m.borrow().ts_ns)
    }
}

#[cfg(test)]
mod tests {
    use super::host::M;
    use super::*;
    use std::panic::{catch_unwind, AssertUnwindSafe};
    use std::sync::{Mutex, MutexGuard};

    // The static buffers are shared, so tests run one at a time.
    static LOCK: Mutex<()> = Mutex::new(());
    const OWNER: &str = "agentproof-town.testnet";

    fn setup() -> MutexGuard<'static, ()> {
        let g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
        M.with(|m| {
            *m.borrow_mut() = host::Mock {
                contract: OWNER.as_bytes().to_vec(),
                caller: OWNER.as_bytes().to_vec(),
                height: 100,
                ts_ns: 1_700_000_000_123_456_789,
                ..Default::default()
            }
        });
        g
    }

    /// Runs a method as `caller`; Ok(returned value) or Err(panic message).
    fn call_as(f: fn(), caller: &str, args: &str) -> Result<String, String> {
        M.with(|m| {
            let mut m = m.borrow_mut();
            m.input = args.as_bytes().to_vec();
            m.caller = caller.as_bytes().to_vec();
            m.ret = None;
        });
        let prev = std::panic::take_hook();
        std::panic::set_hook(Box::new(|_| {}));
        let r = catch_unwind(AssertUnwindSafe(|| f()));
        std::panic::set_hook(prev);
        match r {
            Ok(()) => Ok(M.with(|m| m.borrow().ret.clone().map(|v| String::from_utf8(v).unwrap()).unwrap_or_default())),
            Err(e) => Err(e.downcast_ref::<String>().cloned().unwrap_or_else(|| "non-string panic".into())),
        }
    }
    fn call(f: fn(), args: &str) -> Result<String, String> {
        call_as(f, OWNER, args)
    }
    fn tick(height: u64) {
        M.with(|m| {
            let mut m = m.borrow_mut();
            m.height = height;
            m.ts_ns = height * 1_000_000_000 + 999_999;
        });
    }

    fn dg(c: char) -> String {
        c.to_string().repeat(64)
    }
    fn dec_args(job: &str, digest: &str, verdict: &str, action: &str) -> String {
        format!(
            "{{\"job_id\":\"{job}\",\"delivery_digest\":\"{digest}\",\"checker_version\":\"structured-field-extraction-v1:1.0.0\",\"verdict\":\"{verdict}\",\"action\":\"{action}\",\"buyer_owner\":\"ceoclaw\",\"seller_owner\":\"agentproof\"}}"
        )
    }
    fn decide(job: &str, digest: &str, verdict: &str, action: &str) -> Result<String, String> {
        call(do_record_decision, &dec_args(job, digest, verdict, action))
    }
    fn gd(job: &str) -> String {
        call(do_get_decisions, &format!("{{\"job_id\":\"{job}\"}}")).unwrap()
    }
    fn keys() -> Vec<String> {
        M.with(|m| m.borrow().store.keys().map(|k| String::from_utf8(k.clone()).unwrap()).collect())
    }
    fn stored(key: &str) -> String {
        M.with(|m| String::from_utf8(m.borrow().store[key.as_bytes()].clone()).unwrap())
    }

    #[test]
    fn v1_record_and_get_are_byte_for_byte_unchanged() {
        let _g = setup();
        tick(250);
        let args = format!("{{\"job_id\":\"2d17e4c8\",\"digest\":\"{}\",\"checker_version\":\"v1:1.0.0\"}}", dg('a'));
        let want = format!(
            "{{\"job_id\":\"2d17e4c8\",\"digest\":\"{}\",\"checker_version\":\"v1:1.0.0\",\"block_height\":250,\"block_timestamp_ms\":250000}}",
            dg('a')
        );
        assert_eq!(call(do_record, &args).unwrap(), want);
        assert_eq!(stored("2d17e4c8"), want, "stored under the bare job_id");
        assert_eq!(call(do_get, "{\"job_id\":\"2d17e4c8\"}").unwrap(), want);
        assert_eq!(call(do_get, "{\"job_id\":\"ffff\"}").unwrap(), "null");
        assert_eq!(call(do_record, &args), Err("already recorded".into()));
        assert_eq!(keys(), vec!["2d17e4c8"], "v1 writes nothing else");
    }

    #[test]
    fn v1_validation_and_owner_rules_still_hold() {
        let _g = setup();
        let ok = format!("{{\"job_id\":\"ab\",\"digest\":\"{}\",\"checker_version\":\"v1\"}}", dg('b'));
        assert_eq!(call_as(do_record, "evil.testnet", &ok), Err("only the owner can record".into()));
        assert_eq!(call(do_record, "{\"job_id\":\"ab\"}"), Err("missing field".into()));
        assert_eq!(call(do_record, &ok.replace("\"ab\"", "\"AB\"")), Err("bad job_id".into()));
        assert_eq!(call(do_record, &ok.replace(&dg('b'), "abc")), Err("bad digest".into()));
        assert_eq!(call(do_record, &ok.replace("v1", "v 1")), Err("bad checker_version".into()));
        assert_eq!(call(do_record, "nope"), Err("bad json".into()));
        assert_eq!(call(do_get, "{}"), Err("missing field".into()));
        assert_eq!(call(do_get, "{\"job_id\":\"x\"}"), Err("bad job_id".into()));
        assert!(keys().is_empty(), "no refused call wrote anything");
    }

    #[test]
    fn record_decision_is_owner_only() {
        let _g = setup();
        let r = call_as(do_record_decision, "someone-else.testnet", &dec_args("ab", &dg('a'), "pass", "accept"));
        assert_eq!(r, Err("only the owner can record".into()));
        assert!(keys().is_empty());
    }

    #[test]
    fn record_decision_validates_every_field() {
        let _g = setup();
        let good = dec_args("ab-12", &dg('a'), "pass", "accept");
        let cases: Vec<(String, &str)> = vec![
            (good.replace("\"ab-12\"", "\"AB\""), "bad job_id"),
            (good.replace("\"ab-12\"", "\"\""), "bad job_id"),
            (good.replace("\"ab-12\"", &format!("\"{}\"", "a".repeat(65))), "bad job_id"),
            (good.replace(&dg('a'), &dg('A')), "bad delivery_digest"),
            (good.replace(&dg('a'), &"a".repeat(63)), "bad delivery_digest"),
            (good.replace("structured-field-extraction-v1:1.0.0", "has space"), "bad checker_version"),
            (good.replace("structured-field-extraction-v1:1.0.0", &"v".repeat(65)), "bad checker_version"),
            (good.replace("\"pass\"", "\"PASS\""), "bad verdict"),
            (good.replace("\"pass\"", "\"maybe\""), "bad verdict"),
            (good.replace("\"accept\"", "\"approve\""), "bad action"),
            (good.replace("\"ceoclaw\"", "\"CEOClaw\""), "bad buyer_owner"),
            (good.replace("\"ceoclaw\"", "\"\""), "bad buyer_owner"),
            (good.replace("\"ceoclaw\"", "\"a.b\""), "bad buyer_owner"),
            (good.replace("\"agentproof\"", "\"agent-proof\""), "bad seller_owner"),
            (good.replace("\"agentproof\"", &format!("\"{}\"", "a".repeat(65))), "bad seller_owner"),
            (good.replace("\"verdict\":\"pass\",", ""), "missing field"),
            (good.replace(",\"seller_owner\":\"agentproof\"", ""), "missing field"),
            (good.replace("\"action\"", "\"job_id\""), "bad json"),
            (good.replace("\"pass\"", "7"), "bad json"),
            ("[]".into(), "bad json"),
        ];
        for (args, want) in cases {
            assert_eq!(call(do_record_decision, &args), Err(want.into()), "{args}");
        }
        assert!(keys().is_empty(), "no refused call wrote anything");
        assert!(call(do_record_decision, &good).is_ok());
    }

    #[test]
    fn pairing_table_all_twelve_combinations() {
        let allowed = [
            ("pass", "accept"),
            ("fail", "request_changes"),
            ("fail", "cancel"),
            ("blocked", "none"),
            ("blocked", "cancel"),
        ];
        let mut ok = 0;
        for verdict in ["pass", "fail", "blocked"] {
            for action in ["accept", "request_changes", "cancel", "none"] {
                let _g = setup();
                let r = decide("c0de", &dg('a'), verdict, action);
                if allowed.contains(&(verdict, action)) {
                    ok += 1;
                    assert!(r.is_ok(), "{verdict}+{action}: {r:?}");
                } else {
                    assert_eq!(r, Err("action not allowed for verdict".into()), "{verdict}+{action}");
                    assert!(keys().is_empty(), "{verdict}+{action} wrote");
                }
            }
        }
        assert_eq!(ok, 5);
    }

    #[test]
    fn decision_record_shape_and_returned_value() {
        let _g = setup();
        tick(300);
        let want = format!(
            "{{\"job_id\":\"2d17e4c8\",\"n\":0,\"delivery_digest\":\"{}\",\"checker_version\":\"structured-field-extraction-v1:1.0.0\",\"verdict\":\"fail\",\"action\":\"request_changes\",\"buyer_owner\":\"ceoclaw\",\"seller_owner\":\"agentproof\",\"block_height\":300,\"block_timestamp_ms\":300000}}",
            dg('c')
        );
        assert_eq!(decide("2d17e4c8", &dg('c'), "fail", "request_changes").unwrap(), want);
        assert_eq!(gd("2d17e4c8"), format!("[{want}]"));
        assert_eq!(stored("d:2d17e4c8:0"), want);
        assert_eq!(stored("m:2d17e4c8"), format!("{}01", dg('c')));
        assert_eq!(stored("g:0"), "2d17e4c8:0");
        assert_eq!(stored("gn"), "1");
    }

    #[test]
    fn redelivery_follows_a_non_final_decision() {
        let _g = setup();
        tick(10);
        let r0 = decide("a1", &dg('a'), "fail", "request_changes").unwrap();
        // Same delivery again: refused, nothing written.
        let before = keys();
        assert_eq!(decide("a1", &dg('a'), "fail", "request_changes"), Err("already decided".into()));
        assert_eq!(decide("a1", &dg('a'), "fail", "cancel"), Err("already decided".into()));
        assert_eq!(keys(), before);
        // A new delivery: decision n=1, and a pass on it settles the job.
        tick(11);
        let r1 = decide("a1", &dg('b'), "pass", "accept").unwrap();
        assert!(r1.contains("\"n\":1") && r1.contains("\"block_height\":11"));
        assert_eq!(gd("a1"), format!("[{r0},{r1}]"));
        assert_eq!(stored("m:a1"), format!("{}12", dg('b')));
    }

    #[test]
    fn blocked_then_redelivery_is_allowed() {
        let _g = setup();
        assert!(decide("a2", &dg('a'), "blocked", "none").is_ok());
        assert_eq!(decide("a2", &dg('a'), "blocked", "none"), Err("already decided".into()));
        assert!(decide("a2", &dg('b'), "fail", "request_changes").is_ok());
        assert!(decide("a2", &dg('c'), "blocked", "none").is_ok());
        assert!(gd("a2").contains("\"n\":2"));
    }

    #[test]
    fn accept_settles_the_job() {
        let _g = setup();
        decide("a3", &dg('a'), "pass", "accept").unwrap();
        for (d, v, a) in [("b", "pass", "accept"), ("b", "fail", "request_changes"), ("a", "blocked", "none"), ("c", "blocked", "cancel")] {
            assert_eq!(decide("a3", &dg(d.chars().next().unwrap()), v, a), Err("job settled".into()), "{d} {v} {a}");
        }
        assert_eq!(gd("a3").matches("\"n\":").count(), 1);
    }

    #[test]
    fn cancel_settles_the_job() {
        let _g = setup();
        decide("a4", &dg('a'), "fail", "request_changes").unwrap();
        decide("a4", &dg('b'), "fail", "cancel").unwrap();
        assert_eq!(decide("a4", &dg('c'), "pass", "accept"), Err("job settled".into()));
        // blocked + cancel settles too
        decide("a5", &dg('a'), "blocked", "cancel").unwrap();
        assert_eq!(decide("a5", &dg('b'), "fail", "request_changes"), Err("job settled".into()));
    }

    #[test]
    fn at_most_sixteen_decisions_per_job() {
        let _g = setup();
        let digits = "0123456789abcdef";
        for (i, c) in digits.chars().enumerate() {
            let r = decide("abcdabcd", &dg(c), "fail", "request_changes").unwrap();
            assert!(r.contains(&format!("\"n\":{i},")), "{r}");
        }
        assert_eq!(decide("abcdabcd", &dg('f'), "fail", "request_changes"), Err("already decided".into()));
        assert_eq!(decide("abcdabcd", &("1".repeat(63) + "0"), "fail", "request_changes"), Err("too many decisions".into()));
        assert_eq!(gd("abcdabcd").matches("\"n\":").count(), 16);
        assert_eq!(stored("gn"), "16");
    }

    #[test]
    fn get_decisions_shape_and_isolation() {
        let _g = setup();
        assert_eq!(gd("0a0a"), "[]");
        assert_eq!(call(do_get_decisions, "{}"), Err("missing field".into()));
        assert_eq!(call(do_get_decisions, "{\"job_id\":\"ZZ\"}"), Err("bad job_id".into()));
        decide("aa", &dg('a'), "fail", "request_changes").unwrap();
        decide("bb", &dg('a'), "pass", "accept").unwrap();
        decide("aa", &dg('b'), "pass", "accept").unwrap();
        let aa = gd("aa");
        assert!(aa.starts_with("[{\"job_id\":\"aa\",\"n\":0,") && aa.contains("},{\"job_id\":\"aa\",\"n\":1,") && aa.ends_with("}]"));
        assert!(!aa.contains("\"bb\""));
        assert_eq!(gd("bb").matches("\"job_id\"").count(), 1);
        // A longer id that merely starts with a recorded one is a different job.
        assert_eq!(gd("aa0"), "[]");
    }

    #[test]
    fn list_pages_in_global_record_order() {
        let _g = setup();
        let sj = |s: &str| call(do_list, s);
        assert_eq!(sj("{\"from\":0,\"limit\":10}").unwrap(), "[]");
        decide("aa", &dg('a'), "fail", "request_changes").unwrap();
        decide("bb", &dg('a'), "pass", "accept").unwrap();
        decide("aa", &dg('b'), "pass", "accept").unwrap();
        let all = sj("{\"from\":0,\"limit\":10}").unwrap();
        let ids: Vec<&str> = all.match_indices("\"job_id\":\"").map(|(i, _)| &all[i + 10..i + 12]).collect();
        assert_eq!(ids, ["aa", "bb", "aa"]);
        assert!(all.starts_with("[{") && all.ends_with("}]"));
        let one = sj("{\"from\":1,\"limit\":1}").unwrap();
        assert!(one.starts_with("[{\"job_id\":\"bb\",\"n\":0,") && one.matches("\"job_id\"").count() == 1);
        let tail = sj("{\"from\":2,\"limit\":5}").unwrap();
        assert!(tail.starts_with("[{\"job_id\":\"aa\",\"n\":1,"));
        assert_eq!(sj("{\"from\":3,\"limit\":5}").unwrap(), "[]");
        assert_eq!(sj("{\"from\":999999999,\"limit\":10}").unwrap(), "[]");
        // order of keys does not matter
        assert_eq!(sj("{\"limit\":1,\"from\":1}").unwrap(), one);
    }

    #[test]
    fn list_rejects_bad_arguments() {
        let _g = setup();
        let sj = |s: &str| call(do_list, s);
        assert_eq!(sj("{\"from\":0,\"limit\":0}"), Err("bad limit".into()));
        assert_eq!(sj("{\"from\":0,\"limit\":11}"), Err("bad limit".into()));
        assert_eq!(sj("{\"from\":0}"), Err("missing field".into()));
        assert_eq!(sj("{\"limit\":1}"), Err("missing field".into()));
        assert_eq!(sj("{\"from\":\"0\",\"limit\":1}"), Err("bad json".into()));
        assert_eq!(sj("{\"from\":-1,\"limit\":1}"), Err("bad json".into()));
        assert_eq!(sj("{\"from\":01,\"limit\":1}"), Err("bad json".into()));
        assert_eq!(sj("{\"from\":1.5,\"limit\":1}"), Err("bad json".into()));
        assert_eq!(sj("{\"from\":0,\"limit\":1234567890}"), Err("bad json".into()));
        assert_eq!(sj("{\"from\":0,\"from\":1,\"limit\":1}"), Err("bad json".into()));
    }

    #[test]
    fn v1_and_decision_key_spaces_never_collide() {
        let _g = setup();
        // The same job id used by both a v1 anchor and a decision keeps two independent records.
        call(do_record, &format!("{{\"job_id\":\"ab\",\"digest\":\"{}\",\"checker_version\":\"v1\"}}", dg('9'))).unwrap();
        assert_eq!(call(do_get, "{\"job_id\":\"ab\"}").unwrap().contains("\"digest\""), true);
        assert_eq!(gd("ab"), "[]");
        decide("ab", &dg('1'), "pass", "accept").unwrap();
        assert!(call(do_get, "{\"job_id\":\"ab\"}").unwrap().contains(&dg('9')), "anchor untouched by the decision");
        // A decision alone does not make the v1 anchor exist.
        decide("cd", &dg('1'), "pass", "accept").unwrap();
        assert_eq!(call(do_get, "{\"job_id\":\"cd\"}").unwrap(), "null");
        assert!(call(do_record, &format!("{{\"job_id\":\"cd\",\"digest\":\"{}\",\"checker_version\":\"v1\"}}", dg('2'))).is_ok());
        // Structural proof: every key is either a valid bare job_id (v1) or holds a ':' / is "gn" (gate).
        for k in keys() {
            let v1 = job_id_ok(k.as_bytes());
            let gate = k.contains(':') || k == "gn";
            assert!(v1 ^ gate, "key {k} is ambiguous");
        }
    }

    #[test]
    fn the_largest_possible_output_fits() {
        let _g = setup();
        tick(u32::MAX as u64);
        let big = |c: char| format!("{{\"job_id\":\"{}\",\"delivery_digest\":\"{}\",\"checker_version\":\"{}\",\"verdict\":\"fail\",\"action\":\"request_changes\",\"buyer_owner\":\"{}\",\"seller_owner\":\"{}\"}}",
            "f".repeat(64), dg(c), "V".repeat(64), "z".repeat(64), "y".repeat(64));
        for c in "0123456789abcdef".chars() {
            call(do_record_decision, &big(c)).unwrap();
        }
        eprintln!("REC {}", stored(&format!("d:{}:15", "f".repeat(64))).len());
        let all = gd(&"f".repeat(64));
        assert_eq!(all.matches("\"n\":").count(), 16);
        assert!(all.len() < 8704, "{}", all.len());
        let page = call(do_list, "{\"from\":0,\"limit\":10}").unwrap();
        assert_eq!(page.matches("\"n\":").count(), 10);
    }
}
