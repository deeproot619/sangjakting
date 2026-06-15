// ═══════════════════════════════════════════════════
//  SUPABASE 설정
// ═══════════════════════════════════════════════════
const SUPABASE_URL = 'https://berxifdazrsbnvlavlaq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_iJvkQHaIyAZj7vP4yC8Cvg_5pmPEmzG';

let _sb = null;

function initSB(){
  if(!window.supabase)return;
  try{_sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);}
  catch(e){console.warn('Supabase init failed:',e);}
}

async function syncToSB(k,v){
  if(!_sb)return;
  try{
    if(k==='applications')return;
    let syncVal=v;
    if(k==='mainMenuDefs') syncVal=(v||[]).map(m=>({...m,bg:''}));
    await _sb.from('app_data').upsert({key:k,value:JSON.stringify(syncVal)});
  }catch(e){console.warn('Supabase sync error:',k,e.message);}
}

async function loadFromSB(){
  if(!_sb)return;
  try{
    showSBLoading(true);
    const timeout=new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),10000));
    const query=_sb.from('app_data').select('*');
    const{data,error}=await Promise.race([query,timeout]);
    if(error)throw error;
    if(data){
      const appRows=data.filter(row=>row.key.startsWith('app_'));
      const otherRows=data.filter(row=>!row.key.startsWith('app_')&&row.key!=='applications');

      otherRows.forEach(row=>{
        if(row.key==='mainMenuDefs'){
          const local=DB.get('mainMenuDefs',null);
          const remote=JSON.parse(row.value||'[]');
          const merged=local?remote.map((d,i)=>({...d,bg:local[i]?.bg||''})):remote;
          localStorage.setItem('sjt_mainMenuDefs',JSON.stringify(merged));
        } else {
          localStorage.setItem('sjt_'+row.key,row.value);
        }
      });

      // app_{id} 행만으로 applications 재구성 (단일 정보원, 장부B만 사용)
      const apps=[];
      appRows.forEach(row=>{
        try{
          const rApp=JSON.parse(row.value);
          apps.push({...rApp,fileData:''});
        }catch(e){}
      });
      localStorage.setItem('sjt_applications',JSON.stringify(apps));
    }
  }catch(e){
    console.warn('Supabase 로드 실패, localStorage 사용:',e.message);
  }finally{
    showSBLoading(false);
  }
}

// Supabase에서 app_{id} 개별 row 삭제
async function deleteApplicationFromSB(appId){
  if(!_sb)return;
  try{
    await _sb.from('app_data').delete().eq('key','app_'+appId);
  }catch(e){console.warn('Failed to delete app row:',e.message);}
}

// 신청자 데이터만 Supabase에서 타겟 동기화 (app_{id} 단일 정보원)
async function syncScheduleApplications(scheduleId){
  if(!_sb)return;
  try{
    const timeout=new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),3000));
    const{data,error}=await Promise.race([
      _sb.from('app_data').select('key,value').like('key','app_%'),
      timeout
    ]);
    if(error)throw error;
    if(!data)return;
    const apps=[];
    data.forEach(row=>{
      try{
        const rApp=JSON.parse(row.value);
        apps.push({...rApp,fileData:''});
      }catch(e){}
    });
    localStorage.setItem('sjt_applications',JSON.stringify(apps));
  }catch(e){
    console.warn('Applications sync failed:',e.message);
  }
}

function showSBLoading(show){
  let el=document.getElementById('sb-loading');
  if(!el){
    el=document.createElement('div');
    el.id='sb-loading';
    el.style.cssText='position:fixed;inset:0;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;gap:16px;';
    el.innerHTML='<div style="font-size:22px;color:var(--gold);letter-spacing:3px;">상호작용 관리자</div>'
      +'<div style="font-size:13px;color:var(--txt2);">불러오는 중...</div>'
      +'<div style="width:200px;height:2px;background:var(--bg3);border-radius:2px;overflow:hidden;">'
      +'<div id="sb-bar" style="height:100%;background:var(--gold);width:0;transition:width 1.5s ease;border-radius:2px;"></div></div>';
    document.body.appendChild(el);
    setTimeout(()=>{const bar=document.getElementById('sb-bar');if(bar)bar.style.width='80%';},100);
  }
  el.style.display=show?'flex':'none';
}

const DB={
  get:(k,d=null)=>{try{const v=localStorage.getItem('sjt_'+k);return v!==null?JSON.parse(v):d;}catch{return d;}},
  set:(k,v)=>{try{localStorage.setItem('sjt_'+k,JSON.stringify(v));if(k!=='auth')syncToSB(k,v);return true;}catch{return false;}},
  schedules:()=>DB.get('schedules',[]),
  saveSchedules:v=>DB.set('schedules',v),
  applications:()=>DB.get('applications',[]),
  saveApplications:v=>DB.set('applications',v),
  previews:()=>DB.get('previews',[]),
  savePreviews:v=>DB.set('previews',v),
  reviews:()=>DB.get('reviews',[]),
  saveReviews:v=>DB.set('reviews',v),
  socialLinks:()=>DB.get('socialLinks',[]),
  saveSocialLinks:v=>DB.set('socialLinks',v),
  genderSubText:()=>DB.get('genderSubText',''),
  saveGenderSubText:v=>DB.set('genderSubText',v),
  resMethod:()=>DB.get('resMethod',{
    part1:'★ 꼭 확인해주세요★\n인스타그램 계정을 팔로우한 뒤,\n아래 내용을 DM으로 보내주세요.\n보내주지 않을 시 입장이 제한될 수 있습니다.\n입금자명 + 참여 날짜\nEx) 김상작, 6월6일(토) 18:00',
    bankName:'카카오뱅크',accountHolder:'천*찬',accountNumber:'3333370720655',
    part3:'신청 조건에 부합하지 않거나\n신청 인원이 초과된 경우\n신청이 취소될 수 있습니다.'
  }),
  saveResMethod:v=>DB.set('resMethod',v),
  getEventResMethod:evtId=>{
    if(!evtId||evtId==='global')return DB.resMethod();
    return DB.get('resMethod_'+evtId,null)||DB.resMethod();
  },
  saveEventResMethod:(evtId,v)=>{
    if(!evtId||evtId==='global'){DB.saveResMethod(v);return;}
    DB.set('resMethod_'+evtId,v);
  },
  previewQs:()=>DB.get('previewQs',[
    {id:'pq1',order:1,content:'평소 나의 취미는?'},
    {id:'pq2',order:2,content:'나의 연애 스타일은?'}
  ]),
  savePreviewQs:v=>DB.set('previewQs',v),
  reviewQs:()=>DB.get('reviewQs',[
    {id:'rq1',order:1,content:'참여 후 소감을 남겨주세요.'}
  ]),
  saveReviewQs:v=>DB.set('reviewQs',v),
  reviewNotice:()=>DB.get('reviewNotice','리뷰를 작성해주신 분들께 드리는 선물은 인스타 공지를 확인해 주세요'),
  saveReviewNotice:v=>DB.set('reviewNotice',v),
  previewGuide:()=>DB.get('previewGuide',{enabled:false,content:''}),
  savePreviewGuide:v=>DB.set('previewGuide',v),
  reviewGuide:()=>DB.get('reviewGuide',{enabled:false,content:''}),
  saveReviewGuide:v=>DB.set('reviewGuide',v),
  noticePopup:()=>DB.get('noticePopup',{enabled:false,text:'',textEnabled:true,imageData:'',imageEnabled:true}),
  saveNoticePopup:v=>DB.set('noticePopup',v),
  faq:()=>DB.get('faq',[
    {id:'f1',order:1,question:'상작팅 타임테이블은 어떻게 되나요?',answer:''},
    {id:'f2',order:2,question:'매칭 결과는 소개팅 후 언제 알려주시나요?',answer:''}
  ]),
  saveFaq:v=>DB.set('faq',v),
  isAdmin:()=>DB.get('auth',false),
  // ── 칵테일 주문 ──
  orderOrders:()=>DB.get('orders',[]),
  saveOrderOrders:v=>DB.set('orders',v),
  orderMenu:()=>DB.get('order_menu',null),
  saveOrderMenu:v=>DB.set('order_menu',v),
  orderMaxGlasses:()=>DB.get('order_max_glasses',2),
  saveOrderMaxGlasses:v=>DB.set('order_max_glasses',v),
  orderMaxGlassesPerNum:()=>DB.get('order_max_glasses_per_num',2),
  saveOrderMaxGlassesPerNum:v=>DB.set('order_max_glasses_per_num',v),
  orderLimitMode:()=>DB.get('order_limit_mode','seat'),
  saveOrderLimitMode:v=>DB.set('order_limit_mode',v),
  orderPassword:()=>DB.get('order_password',''),
  saveOrderPassword:v=>DB.set('order_password',v),
  orderActiveSeats:()=>DB.get('order_active_seats',null),
  saveOrderActiveSeats:v=>DB.set('order_active_seats',v),
  setAdmin:v=>DB.set('auth',v),
  events:()=>DB.get('events',[{id:'evt_default',name:'상작팅',isActive:true,previewEnabled:true,reviewEnabled:true,maleCapacity:12,femaleCapacity:12,fileRequired:true}]),
  saveEvents:v=>DB.set('events',v),
  eventPreviewQs:evtId=>evtId==='evt_default'||!evtId?DB.previewQs():DB.get('previewQs_'+evtId,[]),
  saveEventPreviewQs:(evtId,v)=>evtId==='evt_default'||!evtId?DB.savePreviewQs(v):DB.set('previewQs_'+evtId,v),
  eventReviewQs:evtId=>evtId==='evt_default'||!evtId?DB.reviewQs():DB.get('reviewQs_'+evtId,[]),
  saveEventReviewQs:(evtId,v)=>evtId==='evt_default'||!evtId?DB.saveReviewQs(v):DB.set('reviewQs_'+evtId,v),
  DEFAULT_REVIEW_FIELDS:[{id:'rf_name',label:'이름',key:'name',enabled:true},{id:'rf_birthdate',label:'생년월일',key:'birthdate',enabled:true},{id:'rf_partdate',label:'참여일자',key:'participationDate',enabled:true},{id:'rf_gender',label:'성별',key:'gender',enabled:true},{id:'rf_number',label:'참석 번호',key:'number',enabled:true}],
  DEFAULT_APP_FIELDS:[{id:'af_name',label:'이름',key:'name',type:'text',enabled:true,isDefault:true},{id:'af_birthdate',label:'생년월일 (8자리)',key:'birthdate',type:'numeric',enabled:true,isDefault:true},{id:'af_phone',label:'전화번호',key:'phone',type:'tel',enabled:true,isDefault:true},{id:'af_occupation',label:'직업',key:'occupation',type:'text',enabled:true,isDefault:true},{id:'af_file',label:'파일 첨부',key:'file',type:'file',enabled:true,isDefault:true},{id:'af_number',label:'번호 선택',key:'number',type:'number',enabled:true,isDefault:true}],
  getEventReviewFields:evtId=>{const evt=DB.events().find(e=>e.id===evtId);if(evt&&evt.reviewFields)return evt.reviewFields;return DB.DEFAULT_REVIEW_FIELDS.map(f=>({...f}));},
  saveEventReviewFields:(evtId,fields)=>{const events=DB.events();const evt=events.find(e=>e.id===evtId);if(evt){evt.reviewFields=fields;DB.saveEvents(events);}},
  getEventAppFields:evtId=>{const evt=DB.events().find(e=>e.id===evtId);if(evt&&evt.appFields)return evt.appFields;return DB.DEFAULT_APP_FIELDS.map(f=>({...f}));},
  saveEventAppFields:(evtId,fields)=>{const events=DB.events();const evt=events.find(e=>e.id===evtId);if(evt){evt.appFields=fields;DB.saveEvents(events);}},
  getEvtCapacity:(scheduleId,gender)=>{
    const sched=DB.schedules().find(s=>s.id===scheduleId);
    if(!sched)return 12;
    return gender==='남'?(sched.maleCapacity||12):(sched.femaleCapacity||12);
  },
  getEvtCapacityByEvt:(evtId,gender)=>{
    // 해당 이벤트의 첫 번째 활성 일정 기준, 없으면 12
    const sched=DB.schedules().filter(s=>s.eventId===evtId&&s.isVisible)[0];
    if(sched)return gender==='남'?(sched.maleCapacity||12):(sched.femaleCapacity||12);
    return 12;
  },
  getEventFileRequired:evtId=>{
    if(!evtId)return true;
    const evt=DB.events().find(e=>e.id===evtId);
    if(evt&&evt.fileRequired!==undefined)return evt.fileRequired;
    return true;
  },
};

// ═══════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════

// ── 한글 IME 조합 보호 ──
let _isComposing=false;
document.addEventListener('compositionstart',()=>{_isComposing=true;});
document.addEventListener('compositionend',()=>{
  _isComposing=false;
  // 조합 완료 후 전화번호 포맷 재적용
  const activeEl=document.activeElement;
  if(activeEl&&activeEl.id&&activeEl.id.includes('phone')){
    formatPhone({target:activeEl});
  }
});

const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2);
const DAYS=['일','월','화','수','목','금','토'];
function getDayKr(y,m,d){return DAYS[new Date(y,m-1,d).getDay()];}
function formatScheduleText(y,m,d,h,min){
  const dow=getDayKr(y,m,d);
  const hh=String(h).padStart(2,'0');
  const mm=String(min).padStart(2,'0');
  return `${y}년 ${m}월 ${d}일(${dow}), ${hh}:${mm}`;
}
function formatDateShort(y,m,d){
  const dow=getDayKr(y,m,d);
  return `${m}월 ${d}일(${dow})`;
}

// toast
function toast(msg,type='info'){
  const w=document.getElementById('toastWrap');
  const t=document.createElement('div');
  t.className=`toast ${type}`;
  t.textContent=msg;
  w.appendChild(t);
  setTimeout(()=>t.remove(),3000);
}

// confirm dialog
let _confirmCb=null;
function confirm2(msg,cb){
  document.getElementById('confirmMsg').textContent=msg;
  document.getElementById('confirmOverlay').classList.add('open');
  _confirmCb=cb;
}
document.getElementById('confirmYes').onclick=()=>{
  document.getElementById('confirmOverlay').classList.remove('open');
  if(_confirmCb)_confirmCb();
  _confirmCb=null;
};
document.getElementById('confirmNo').onclick=()=>{
  document.getElementById('confirmOverlay').classList.remove('open');
  _confirmCb=null;
};

function scrollToTop(){window.scrollTo({top:0,behavior:'smooth'});}

// dropdown open/close
function toggleDrop(id){
  const btn=document.getElementById(id+'-btn');
  const menu=document.getElementById(id+'-menu');
  const isOpen=menu.classList.contains('open');
  // close all
  document.querySelectorAll('.dropdown-menu.open').forEach(m=>m.classList.remove('open'));
  document.querySelectorAll('.dropdown-trigger.open').forEach(b=>b.classList.remove('open'));
  if(!isOpen){menu.classList.add('open');btn.classList.add('open');}
}
document.addEventListener('click',e=>{
  if(!e.target.closest('.dropdown-wrap')){
    document.querySelectorAll('.dropdown-menu.open').forEach(m=>m.classList.remove('open'));
    document.querySelectorAll('.dropdown-trigger.open').forEach(b=>b.classList.remove('open'));
  }
});

// participation date format YYYYMMDD -> YYYY.MM.DD
function formatPartDate(s){
  if(!s||s.length!==8)return s;
  return s.slice(0,4)+'.'+s.slice(4,6)+'.'+s.slice(6,8);
}

// phone format
function formatPhone(e){
  if(_isComposing)return; // 한글 조합 중 실행 안 함
  let v=e.target.value.replace(/\D/g,'').slice(0,11);
  if(v.length>=8)v=v.slice(0,3)+'-'+v.slice(3,7)+'-'+v.slice(7);
  else if(v.length>=4)v=v.slice(0,3)+'-'+v.slice(3);
  e.target.value=v;
}

// pagination renderer
function renderPagination(containerId,current,total,perPage,onPageChange){
  const el=document.getElementById(containerId);
  if(!el)return;
  const totalPages=Math.ceil(total/perPage);
  if(totalPages<=1){el.innerHTML='';return;}
  const group=Math.floor((current-1)/5);
  const start=group*5+1;
  const end=Math.min(start+4,totalPages);
  let html='<div class="pagination">';
  html+=`<button class="pg-btn" ${current===1?'disabled':''} onclick="${onPageChange}(1)">«</button>`;
  html+=`<button class="pg-btn" ${current===1?'disabled':''} onclick="${onPageChange}(${current-1})">‹</button>`;
  for(let i=start;i<=end;i++){
    html+=`<button class="pg-btn ${i===current?'active':''}" onclick="${onPageChange}(${i})">${i}</button>`;
  }
  html+=`<button class="pg-btn" ${current===totalPages?'disabled':''} onclick="${onPageChange}(${current+1})">›</button>`;
  html+=`<button class="pg-btn" ${current===totalPages?'disabled':''} onclick="${onPageChange}(${totalPages})">»</button>`;
  html+='</div>';
  el.innerHTML=html;
}

// ═══════════════════════════════════════════════════
//  ROUTER
// ═══════════════════════════════════════════════════
const PAGES={
  'main':'page-main',
  'preview-write':'page-preview-write',
  'preview-view':'page-preview-view',
  'review-write':'page-review-write',
  'review-view':'page-review-view',
  'faq':'page-faq',
  'admin-login':'page-admin-login',
  'admin-main':'page-admin-main',
  'admin-schedules':'page-admin-schedules',
  'admin-applicants':'page-admin-applicants',
  'admin-preview':'page-admin-preview',
  'admin-reviews':'page-admin-reviews',
  'admin-res':'page-admin-res',
  'admin-main-manage':'page-admin-main-manage',
  'admin-pq':'page-admin-pq',
  'admin-rq':'page-admin-rq',
  'admin-faq':'page-admin-faq',
  'admin-popup':'page-admin-popup',
  'admin-events':'page-admin-events',
  'admin-order':'page-admin-order',
};
const ADMIN_PAGES=['admin-main','admin-main-manage','admin-schedules','admin-applicants','admin-preview','admin-reviews','admin-res','admin-pq','admin-rq','admin-faq','admin-popup','admin-events','admin-order'];

let currentPage='main';
function go(page,params={},pushState=true){
  const PUB=['main','preview-write','preview-view','review-write','review-view','faq'];
  if(PUB.includes(page)){window.location.href='index.html';return;}
  if(ADMIN_PAGES.includes(page)&&!DB.isAdmin()){go('admin-login',{},pushState);return;}
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const pid=PAGES[page];
  if(!pid)return;
  document.getElementById(pid).classList.add('active');
  currentPage=page;
  window.scrollTo(0,0);
  if(pushState){
    const state={page,params};
    history.pushState(state, '', '#'+page);
  }
  // init page
  if(page==='main')initMain();
  else if(page==='preview-write')initPW();
  else if(page==='preview-view')initPV();
  else if(page==='review-write')initRW();
  else if(page==='review-view')initRV(1);
  else if(page==='faq')initFAQ();
  else if(page==='admin-main')initAdminMain();
  else if(page==='admin-schedules')initAdminSchedules(1);
  else if(page==='admin-applicants')initAdminApplicants(params.scheduleId||currentSchedId);
  else if(page==='admin-preview')initAdminPreview();
  else if(page==='admin-reviews')initAdminReviews(1);
  else if(page==='admin-res')initAdminRes();
  else if(page==='admin-main-manage')initAdminMainManage();
  else if(page==='admin-faq')initAdminFAQ();
  else if(page==='admin-popup')initAdminPopup();
  else if(page==='admin-events')initAdminEvents();
  else if(page==='admin-order')initAdminOrder();
}

// ═══════════════════════════════════════════════════
//  ADMIN SIDEBAR & TOPNAV
// ═══════════════════════════════════════════════════
// 일정의 질문 목록 가져오기 (스냅샷 우선)
function getScheduleQuestions(scheduleId){
  const scheds=DB.schedules();
  const sched=scheds.find(s=>s.id===scheduleId);
  if(!sched)return DB.previewQs().sort((a,b)=>a.order-b.order);
  // 스냅샷 있으면 스냅샷 반환
  if(sched.previewQuestions&&sched.previewQuestions.length>0){
    return sched.previewQuestions;
  }
  // 스냅샷 없으면 이벤트별 현재 질문으로 자동 생성 후 저장
  const evtId=sched.eventId||'evt_default';
  const currentQs=DB.eventPreviewQs(evtId).sort((a,b)=>a.order-b.order);
  sched.previewQuestions=currentQs.map(q=>({id:q.id,order:q.order,content:q.content}));
  DB.saveSchedules(scheds);
  return sched.previewQuestions;
}

// 일정 날짜가 지났는지 확인
function isScheduleExpired(s){
  const today=new Date();
  today.setHours(0,0,0,0);
  const schedDate=new Date(s.year,s.month-1,s.day);
  return schedDate<today;
}

function buildSidebar(pageNum,activePage){
  const items=[
    {label:'메인 관리',page:'admin-main-manage'},
    {label:'이벤트 & 일정 관리',page:'admin-events'},
    {label:'신청자 현황 관리',page:'admin-applicants'},
    {label:'Preview 관리',page:'admin-preview'},
    {label:'Review 관리',page:'admin-reviews'},
    {label:'예약신청 안내문구 관리',page:'admin-res'},
    {label:'FAQ 관리',page:'admin-faq'},
    {label:'팝업 관리',page:'admin-popup'},
    {label:'칵테일 주문 관리',page:'admin-order'},
  ];
  let html=`<div class="sidebar-logo">상호작용</div>`;
  html+=`<div class="sidebar-label">관리자</div>`;
  items.forEach(it=>{
    html+=`<div class="sidebar-link ${activePage===it.page?'active':''}" onclick="go('${it.page}')">${it.label}</div>`;
  });
  html+=`<div style="margin-top:auto;padding:16px 18px;border-top:1px solid var(--bd);">
    <button class="btn btn-secondary btn-sm btn-full" onclick="doLogout()">로그아웃</button>
  </div>`;
  const el=document.getElementById('sidebar-'+pageNum);
  if(el)el.innerHTML=html;
}
function buildTopNav(pageNum){
  const items=[
    {label:'메인 페이지',onclick:"go('main')"},
    {label:'Preview 보기',onclick:"go('preview-view')"},
    {label:'Review 보기',onclick:"go('review-view')"},
    {label:'Preview 작성',onclick:"go('preview-write')"},
    {label:'Review 작성',onclick:"go('review-write')"},
    {label:'예약 신청 방법',onclick:"go('main')"},
    {label:'FAQ',onclick:"go('faq')"},
  ];
  let html='';
  items.forEach(it=>{
    html+=`<a onclick="${it.onclick}">${it.label}</a>`;
  });
  const el=document.getElementById('topnav-'+pageNum);
  if(el)el.innerHTML=html;
}
function setupAdmin(pageNum,activePage){
  buildSidebar(pageNum,activePage);
  buildTopNav(pageNum);
}

function openExtLink(url){
  if(!url){toast('등록된 링크가 없습니다.','error');return;}
  window.open(url,'_blank');
}
function doLogout(){DB.setAdmin(false);window.location.href='index.html';}

// ═══════════════════════════════════════════════════
//  PAGE 8: ADMIN LOGIN
// ═══════════════════════════════════════════════════
async function doLogin(){
  const pw=document.getElementById('login-pw').value;
  const enc=new TextEncoder();
  const buf=await crypto.subtle.digest('SHA-256',enc.encode(pw));
  const hex=Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(hex==='360e59b8465ac5c57ff1025b1e242cf8e4a5c376b887ca01e6f63b1d0c4b2996'){
    DB.setAdmin(true);
    document.getElementById('login-pw').value='';
    document.getElementById('login-err').style.display='none';
    go('admin-main');
  }else{
    document.getElementById('login-err').style.display='block';
  }
}

// ═══════════════════════════════════════════════════
//  PAGE 1: MAIN
// ═══════════════════════════════════════════════════
let mainState={scheduleId:null,gender:null,number:null,file:null,fileName:null};

function initMain(){
  // Menu grid
  const defaultDefs=[
    {id:'apply',label:'신청하기',icon:'📋',action:"go('application')",bg:''},
    {id:'order',label:'칵테일 주문',icon:'🍹',action:"go('order')",bg:''},
    {id:'matching',label:'매칭 결과',icon:'💑',action:"openExtLink('https://script.google.com/macros/s/AKfycbxSB1QsTuKsYITuNu5swx1Rzo2rZzApimyFVBWEofF4ZgtJuQ002TAK2mPONC-3xhyhmw/exec')",bg:''},
    {id:'pv-view',label:'자기소개서 모음',icon:'👀',action:"go('preview-view')",bg:''},
    {id:'rv-view',label:'상작팅 후기',icon:'💬',action:"go('review')",bg:''},
    {id:'faq',label:'Q&A',icon:'❓',action:"go('faq')",bg:''},
  ];
  const savedDefs=DB.get('mainMenuDefs',null);
  const menuDefs=defaultDefs.map(d=>{
    const s=savedDefs?savedDefs.find(x=>x.id===d.id):null;
    return s?{...d,label:s.label||d.label,bg:s.bg||'',action:d.action}:d;
  });
  const grid=document.getElementById('mainMenuGrid');
  grid.innerHTML=menuDefs.map(it=>`
    <div class="menu-item" onclick="${it.action}" style="${it.bg?'background:url('+it.bg+') center/cover no-repeat;border:none;':''}">
      ${it.bg?'':'<div class="menu-icon">'+it.icon+'</div>'}
      <div style="${it.bg?'background:rgba(0,0,0,.45);padding:6px 10px;border-radius:6px;width:100%;text-align:center;':''}">${it.label}</div>
    </div>`).join('');

  // Schedules dropdown (visible only)
  const scheds=DB.schedules().filter(s=>s.isVisible).sort((a,b)=>b.createdAt-a.createdAt);
  const menu=document.getElementById('main-schedule-menu');
  if(scheds.length===0){
    menu.innerHTML='<div class="dropdown-empty">등록된 일정이 없습니다.</div>';
  }else{
    menu.innerHTML=scheds.map(s=>`
      <div class="dropdown-item" onclick="selectMainSchedule('${s.id}','${s.displayText}')">${s.displayText}</div>
    `).join('');
  }

  // Reset state
  mainState={scheduleId:null,gender:null,number:null,file:null,fileName:null};
  document.getElementById('main-schedule-val').textContent='일정을 선택하여 예약해주세요.';
  document.getElementById('gender-male').classList.remove('selected');
  document.getElementById('gender-female').classList.remove('selected');
  document.getElementById('m-name').value='';
  document.getElementById('m-birth').value='';
  document.getElementById('m-phone').value='';
  document.getElementById('m-job').value='';
  document.getElementById('fileArea').classList.remove('has-file');
  document.getElementById('fileAreaTxt').textContent='파일을 선택하거나 여기를 클릭하세요';
  document.getElementById('chk-privacy').checked=false;
  document.getElementById('chk-res').checked=false;
  document.getElementById('chk-pay').checked=false;
  document.getElementById('submitMsg').style.display='none';
  document.getElementById('submitBtn').style.display='';
  document.getElementById('numSelectArea').innerHTML='<div class="empty-state" style="padding:16px;">일정과 성별을 먼저 선택해주세요.</div>';
  updateSubmitBtn();

  // phone input
  document.getElementById('m-phone').oninput=formatPhone;
}

function selectMainSchedule(id,text){
  mainState.scheduleId=id;
  mainState.number=null;
  document.getElementById('main-schedule-val').textContent=text;
  document.getElementById('main-schedule-btn').classList.remove('open');
  document.getElementById('main-schedule-menu').classList.remove('open');
  renderNumberGrid();
  updateSubmitBtn();
}

function selectGender(g){
  mainState.gender=g;
  mainState.number=null;
  document.getElementById('gender-male').classList.toggle('selected',g==='남');
  document.getElementById('gender-female').classList.toggle('selected',g==='여');
  renderNumberGrid();
  updateSubmitBtn();
}

function renderNumberGrid(){
  const area=document.getElementById('numSelectArea');
  if(!mainState.scheduleId||!mainState.gender){
    area.innerHTML='<div class="empty-state" style="padding:16px;">일정과 성별을 먼저 선택해주세요.</div>';
    return;
  }
  const taken=getTakenNumbers(mainState.scheduleId,mainState.gender);
  const capacity=DB.getEvtCapacity(mainState.scheduleId,mainState.gender);
  let html=`<div class="num-section-title">${mainState.gender}자 번호 선택</div><div class="number-grid">`;
  for(let i=1;i<=capacity;i++){
    const isTaken=taken.includes(i);
    const isSel=mainState.number===i;
    const cls='num-btn'+(isTaken?' taken':'')+(isSel?' selected':'');
    const attrs=isTaken?'disabled':('onclick="selectNumber('+i+')"');
    html+=`<button class="${cls}" ${attrs}>${i}번</button>`;
  }
  html+='</div>';
  area.innerHTML=html;
}

function getTakenNumbers(scheduleId,gender){
  return DB.applications()
    .filter(a=>a.scheduleId===scheduleId&&a.gender===gender)
    .map(a=>a.number);
}

function selectNumber(n){
  mainState.number=n;
  renderNumberGrid();
  updateSubmitBtn();
}

function handleFile(input){
  const file=input.files[0];
  if(!file)return;
  if(file.size>5*1024*1024){toast('파일 크기는 5MB 이하만 가능합니다.','error');return;}
  const reader=new FileReader();
  reader.onload=e=>{
    mainState.file=e.target.result;
    mainState.fileName=file.name;
    document.getElementById('fileArea').classList.add('has-file');
    document.getElementById('fileAreaTxt').textContent=`✓ ${file.name}`;
  };
  reader.readAsDataURL(file);
}

function updateSubmitBtn(){
  const p=document.getElementById('chk-privacy').checked;
  const r=document.getElementById('chk-res').checked;
  const pay=document.getElementById('chk-pay').checked;
  document.getElementById('submitBtn').disabled=!(p&&r&&pay);
}

function openResModal(){
  renderResModalContent();
  document.getElementById('resModal').classList.add('open');
}
function closeResModal(){document.getElementById('resModal').classList.remove('open');}

function renderResModalContent(){
  const rm=DB.resMethod();
  const el=document.getElementById('resModalContent');
  el.innerHTML=`
    <div class="res-part" style="margin-bottom:12px;">
      <div class="res-content">${rm.part1}</div>
    </div>
    <div class="res-part" style="margin-bottom:12px;text-align:center;">
      <div style="font-size:13px;color:var(--txt2);margin-bottom:8px;">아래 계좌로 입금 후 예약 신청을 완료해주세요.</div>
      <div style="font-size:14px;color:var(--txt);font-weight:600;">${rm.bankName} (${rm.accountHolder})</div>
      <div class="account-row" style="justify-content:center;">
        <span class="account-number">${rm.accountNumber}</span>
        <button class="copy-btn" onclick="copyAccount('${rm.accountNumber}')">복사</button>
      </div>
    </div>
    <div class="res-part">
      <div class="res-content" style="color:var(--txt2);font-size:13px;">${rm.part3}</div>
    </div>
  `;
}

function copyAccount(num){
  navigator.clipboard.writeText(num).then(()=>toast('계좌번호가 복사되었습니다.','success')).catch(()=>{
    const ta=document.createElement('textarea');
    ta.value=num;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();document.execCommand('copy');
    document.body.removeChild(ta);toast('계좌번호가 복사되었습니다.','success');
  });
}

function handlePaymentDone(){
  document.getElementById('chk-res').checked=true;
  closeResModal();
  updateSubmitBtn();
  toast('예약 신청 방법 확인이 완료되었습니다.','success');
}

function submitApplication(){
  const schedId=mainState.scheduleId;
  const gender=mainState.gender;
  const number=mainState.number;
  const name=document.getElementById('m-name').value.trim();
  const birth=document.getElementById('m-birth').value.trim();
  const phone=document.getElementById('m-phone').value.trim();
  const job=document.getElementById('m-job').value.trim();

  if(!schedId){toast('일정을 선택해주세요.','error');return;}
  if(!gender){toast('성별을 선택해주세요.','error');return;}
  if(!name){toast('이름을 입력해주세요.','error');return;}
  if(birth.length!==8){toast('생년월일을 8자리로 입력해주세요.','error');return;}
  if(phone.length<12){toast('전화번호를 입력해주세요.','error');return;}
  if(!job){toast('직업을 입력해주세요.','error');return;}
  if(!number){toast('상작팅 번호를 선택해주세요.','error');return;}

  // Check if number is still available
  const taken=getTakenNumbers(schedId,gender);
  if(taken.includes(number)){toast('선택한 번호가 이미 신청되었습니다. 다른 번호를 선택해주세요.','error');renderNumberGrid();return;}

  const now=Date.now();
  const app={
    id:uid(),scheduleId:schedId,gender,number,name,birthdate:birth,
    phone,occupation:job,
    fileName:mainState.fileName||'',
    fileData:mainState.file||'',
    fileSubmittedAt:now,
    submittedAt:now
  };
  const apps=DB.applications();
  apps.push(app);
  DB.saveApplications(apps);

  // Show success
  document.getElementById('submitBtn').style.display='none';
  const msg=document.getElementById('submitMsg');
  msg.innerHTML='✅ 예약 신청이 완료되었습니다!<br><small style="color:var(--txt2);">확인 후 연락드리겠습니다.</small>';
  msg.style.display='block';
  toast('예약 신청이 완료되었습니다.','success');
}

// ═══════════════════════════════════════════════════
//  PAGE 2: RESERVATION METHOD (standalone view from nav if needed)
// ═══════════════════════════════════════════════════
// (Handled as modal in main page)

// ═══════════════════════════════════════════════════
//  PAGE 3: PREVIEW WRITE
// ═══════════════════════════════════════════════════
let pwState={scheduleId:null,verifiedApp:null};

function initPW(){
  pwState={scheduleId:null,verifiedApp:null};
  // Schedules with isPreviewActive
  const scheds=DB.schedules().filter(s=>s.isPreviewActive).sort((a,b)=>b.createdAt-a.createdAt);
  const menu=document.getElementById('pw-schedule-menu');
  if(scheds.length===0){
    menu.innerHTML='<div class="dropdown-empty">활성화된 일정이 없습니다.</div>';
  }else{
    menu.innerHTML=scheds.map(s=>`
      <div class="dropdown-item" onclick="selectPWSchedule('${s.id}','${s.displayText}')">${s.displayText}</div>
    `).join('');
  }
  document.getElementById('pw-schedule-val').textContent='일정을 선택해주세요.';
  document.getElementById('pw-name').value='';
  document.getElementById('pw-birth').value='';
  document.getElementById('pw-verify-msg').textContent='';
  document.getElementById('pw-form-area').style.display='none';

}

function selectPWSchedule(id,text){
  pwState.scheduleId=id;
  pwState.verifiedApp=null;
  document.getElementById('pw-schedule-val').textContent=text;
  document.getElementById('pw-schedule-btn').classList.remove('open');
  document.getElementById('pw-schedule-menu').classList.remove('open');
  document.getElementById('pw-form-area').style.display='none';
  document.getElementById('pw-verify-msg').textContent='';

}

function verifyWriter(){
  if(!pwState.scheduleId){toast('일정을 먼저 선택해주세요.','error');return;}
  const name=document.getElementById('pw-name').value.trim();
  const birth=document.getElementById('pw-birth').value.trim();
  if(!name||!birth){toast('이름과 생년월일을 입력해주세요.','error');return;}
  const app=DB.applications().find(a=>a.scheduleId===pwState.scheduleId&&a.name===name&&a.birthdate===birth);
  const msg=document.getElementById('pw-verify-msg');
  if(!app){
    msg.className='text-sm mt8 text-err';
    msg.textContent='신청자 현황과 일치하지 않습니다.';
    document.getElementById('pw-form-area').style.display='none';
  
    pwState.verifiedApp=null;
    return;
  }
  pwState.verifiedApp=app;
  msg.className='text-sm mt8 text-ok';
  msg.textContent=`확인되었습니다. (${app.gender}자 ${app.number}번)`;

  renderPWForm();
  loadPrevPreview();
}

function renderPWForm(){
  const qs=DB.previewQs().sort((a,b)=>a.order-b.order);
  const area=document.getElementById('pw-form-area');
  if(qs.length===0){area.innerHTML='<div class="empty-state">등록된 질문이 없습니다.</div>';area.style.display='block';return;}
  let html='<div class="card-hd">Preview 작성</div>';
  qs.forEach(q=>{
    html+=`<div class="form-group">
      <label class="form-label">Q${q.order}. ${q.content}</label>
      <textarea class="form-textarea" id="pw-ans-${q.id}" placeholder="내용을 입력하세요"></textarea>
    </div>`;
  });
  html+=`<button class="btn btn-primary btn-full mt16" onclick="savePreview()">작성(수정) 완료</button>`;
  area.innerHTML=html;
  area.style.display='block';
}

function loadPrevPreview(){
  if(!pwState.verifiedApp)return;
  const {scheduleId,gender,number}=pwState.verifiedApp;
  const prev=DB.previews().find(p=>p.scheduleId===scheduleId&&p.gender===gender&&p.number===number);
  if(!prev)return;
  const qs=DB.previewQs();
  qs.forEach(q=>{
    const el=document.getElementById('pw-ans-'+q.id);
    if(el&&prev.answers[q.id])el.value=prev.answers[q.id];
  });
  toast('이전 작성 내용을 불러왔습니다.','info');
}

function savePreview(){
  if(!pwState.verifiedApp){toast('작성자 확인이 필요합니다.','error');return;}
  const qs=DB.previewQs();
  const answers={};
  let hasAll=true;
  qs.forEach(q=>{
    const el=document.getElementById('pw-ans-'+q.id);
    const val=el?el.value.trim():'';
    if(!val)hasAll=false;
    answers[q.id]=val;
  });
  if(!hasAll){toast('모든 질문에 답변해주세요.','error');return;}
  const {scheduleId,gender,number}=pwState.verifiedApp;
  const prevs=DB.previews();
  const idx=prevs.findIndex(p=>p.scheduleId===scheduleId&&p.gender===gender&&p.number===number);
  const entry={scheduleId,gender,number,answers,updatedAt:Date.now()};
  if(idx>=0)prevs[idx]=entry;else prevs.push(entry);
  DB.savePreviews(prevs);
  toast('Preview가 저장되었습니다.','success');
}

// ═══════════════════════════════════════════════════
//  PAGE 4: PREVIEW VIEW
// ═══════════════════════════════════════════════════
let pvState={scheduleId:null,selected:null};

function initPV(){
  pvState={scheduleId:null,selected:null};
  const scheds=DB.schedules().sort((a,b)=>b.createdAt-a.createdAt);
  const menu=document.getElementById('pv-schedule-menu');
  if(scheds.length===0){
    menu.innerHTML='<div class="dropdown-empty">등록된 일정이 없습니다.</div>';
  }else{
    menu.innerHTML=scheds.map(s=>`
      <div class="dropdown-item" onclick="selectPVSchedule('${s.id}','${s.displayText}')">${s.displayText}</div>
    `).join('');
  }
  document.getElementById('pv-schedule-val').textContent='일정을 선택해주세요.';
  document.getElementById('pv-people-area').style.display='none';
  setupTopBtn('pv-top-btn');
}

function selectPVSchedule(id,text){
  pvState.scheduleId=id;pvState.selected=null;
  document.getElementById('pv-schedule-val').textContent=text;
  document.getElementById('pv-schedule-btn').classList.remove('open');
  document.getElementById('pv-schedule-menu').classList.remove('open');
  document.getElementById('pv-people-area').style.display='block';
  renderPVGrid();
  document.getElementById('pv-content-area').innerHTML='';
}

function renderPVGrid(){
  ['male','female'].forEach(g=>{
    const gender=g==='male'?'남':'여';
    const grid=document.getElementById(`pv-${g}-grid`);
    const capacity=DB.getEvtCapacity(pvState.scheduleId,gender);
    let html='';
    for(let i=1;i<=capacity;i++){
      const isActive=pvState.selected&&pvState.selected.gender===gender&&pvState.selected.number===i;
      html+=`<button class="person-btn ${isActive?'active':''}" onclick="selectPVPerson('${gender}',${i})">${gender}자 ${i}번</button>`;
    }
    grid.innerHTML=html;
  });
}

function selectPVPerson(gender,number){
  pvState.selected={gender,number};
  renderPVGrid();
  const prev=DB.previews().find(p=>p.scheduleId===pvState.scheduleId&&p.gender===gender&&p.number===number);
  const qs=DB.previewQs().sort((a,b)=>a.order-b.order);
  const area=document.getElementById('pv-content-area');
  let html=`<div class="card"><div class="card-hd">${gender}자 ${number}번</div>`;
  if(!prev||qs.length===0){
    html+='<div class="pv-empty">아직 작성된 내용이 없습니다.</div>';
  }else{
    html+='<div class="preview-content">';
    qs.forEach(q=>{
      html+=`<div class="pv-q">Q${q.order}. ${q.content}</div>
             <div class="pv-a">${prev.answers[q.id]||'(미작성)'}</div>`;
    });
    html+='</div>';
  }
  html+='</div>';
  area.innerHTML=html;
}

function setupTopBtn(btnId){
  const btn=document.getElementById(btnId);
  if(!btn)return;
  // Remove previous scroll listener
  if(window._scrollHandler)window.removeEventListener('scroll',window._scrollHandler);
  window._scrollHandler=()=>{btn.classList.toggle('visible',window.scrollY>300);};
  window.addEventListener('scroll',window._scrollHandler);
}

// ═══════════════════════════════════════════════════
//  PAGE 5: REVIEW WRITE
// ═══════════════════════════════════════════════════
let rwState={gender:null,number:null,verified:false};

function initRW(){
  rwState={gender:null,number:null,verified:false};
  document.getElementById('rw-name').value='';
  document.getElementById('rw-birth').value='';
  document.getElementById('rw-partdate').value='';
  document.getElementById('rw-gender-val').textContent='선택해주세요';
  document.getElementById('rw-num-val').textContent='선택해주세요';
  document.getElementById('rw-verify-msg').textContent='';
  document.getElementById('rw-done-msg').style.display='none';
  // Render review questions immediately
  renderRWForm();

  // Notice
  const notice=DB.reviewNotice();
  const na=document.getElementById('rw-notice-area');
  if(notice){na.innerHTML=`<div class="card" style="text-align:center;color:var(--gold);font-size:13px;">${notice}</div>`;}

  // Number dropdown - 이벤트 capacity 기반
  const rwCap=DB.getEvtCapacityByEvt(rwState.eventId||'evt_default','남');
  const rwCapF=DB.getEvtCapacityByEvt(rwState.eventId||'evt_default','여');
  const maxCap=Math.max(rwCap,rwCapF);
  let html='';
  for(let i=1;i<=maxCap;i++)html+=`<div class="dropdown-item" onclick="selectRwNum(${i})">${i}번</div>`;
  document.getElementById('rw-num-menu').innerHTML=html;
}

function selectRwGender(g){
  rwState.gender=g;
  document.getElementById('rw-gender-val').textContent=g;
  document.getElementById('rw-gender-btn').classList.remove('open');
  document.getElementById('rw-gender-menu').classList.remove('open');
  checkRwForm();
}

function selectRwNum(n){
  rwState.number=n;
  document.getElementById('rw-num-val').textContent=n+'번';
  document.getElementById('rw-num-btn').classList.remove('open');
  document.getElementById('rw-num-menu').classList.remove('open');
  checkRwForm();
}

function checkRwForm(){
  const name=document.getElementById('rw-name').value.trim();
  const birth=document.getElementById('rw-birth').value.trim();
  const pdate=document.getElementById('rw-partdate').value.trim();
  const ready=name&&birth.length===8&&pdate.length===8&&rwState.gender&&rwState.number;
  if(ready)verifyRWParticipant();
}

function verifyRWParticipant(){
  const name=document.getElementById('rw-name').value.trim();
  const birth=document.getElementById('rw-birth').value.trim();
  const pdate=document.getElementById('rw-partdate').value.trim();
  const msg=document.getElementById('rw-verify-msg');
  // Find matching application: name + birthdate + schedule date matches pdate
  const scheds=DB.schedules();
  const apps=DB.applications();
  // pdate format YYYYMMDD, schedule displayText contains year/month/day
  const matched=apps.find(a=>{
    if(a.name!==name||a.birthdate!==birth)return false;
    const sched=scheds.find(s=>s.id===a.scheduleId);
    if(!sched)return false;
    // Build date string from schedule
    const schedDate=`${sched.year}${String(sched.month).padStart(2,'0')}${String(sched.day).padStart(2,'0')}`;
    return schedDate===pdate;
  });
  if(!matched){
    msg.className='text-sm mt8 text-err';
    msg.textContent='참석자 현황과 일치하지 않습니다.';
    const btn5=document.getElementById('rw-submit-btn');
    if(btn5)btn5.disabled=true;
    rwState.verified=false;
    return;
  }
  rwState.verified=true;
  msg.className='text-sm mt8 text-ok';
  msg.textContent='확인되었습니다.';
}

function renderRWForm(){
  const qs=DB.reviewQs().sort((a,b)=>a.order-b.order);
  const area=document.getElementById('rw-form-area');
  let html='<div class="card-hd">리뷰 작성</div>';
  qs.forEach(q=>{
    html+=`<div class="form-group">
      <label class="form-label">Q${q.order}. ${q.content}</label>
      <textarea class="form-textarea" id="rw-ans-${q.id}" placeholder="내용을 입력하세요" oninput="checkRwSubmit()"></textarea>
    </div>`;
  });
  area.innerHTML=html+`<button class="btn btn-primary btn-full mt16" id="rw-submit-btn" disabled onclick="submitReview()">작성 완료</button>`;
  area.style.display='block';
}

function checkRwSubmit(){
  const qs=DB.reviewQs();
  const allFilled=qs.every(q=>{
    const el=document.getElementById('rw-ans-'+q.id);
    return el&&el.value.trim().length>0;
  });
  const btn=document.getElementById('rw-submit-btn');
  if(btn)btn.disabled=!allFilled||!rwState.verified;
}

function submitReview(){
  if(!rwState.verified){toast('참석자 확인이 필요합니다.','error');return;}
  const qs=DB.reviewQs();
  const answers={};
  qs.forEach(q=>{
    const el=document.getElementById('rw-ans-'+q.id);
    answers[q.id]=el?el.value.trim():'';
  });
  const review={
    id:uid(),
    name:document.getElementById('rw-name').value.trim(),
    birthdate:document.getElementById('rw-birth').value.trim(),
    participationDate:document.getElementById('rw-partdate').value.trim(),
    gender:rwState.gender,
    number:rwState.number,
    answers,
    createdAt:Date.now()
  };
  const reviews=DB.reviews();
  reviews.push(review);
  DB.saveReviews(reviews);
  document.getElementById('rw-form-area').style.display='none';
  const done=document.getElementById('rw-done-msg');
  done.innerHTML='소중한 리뷰작성 감사합니다 :)';
  done.style.display='block';
  toast('리뷰가 등록되었습니다.','success');
}

// ═══════════════════════════════════════════════════
//  PAGE 6: REVIEW VIEW
// ═══════════════════════════════════════════════════
let rvPage=1;
const RV_PER_PAGE=3;

function initRV(page){
  rvPage=page||1;
  renderRV();
}

function renderRV(){
  const reviews=DB.reviews().sort((a,b)=>b.createdAt-a.createdAt);
  const empty=document.getElementById('rv-empty');
  const list=document.getElementById('rv-list');
  if(reviews.length===0){empty.style.display='block';list.innerHTML='';document.getElementById('rv-pagination').innerHTML='';return;}
  empty.style.display='none';
  const start=(rvPage-1)*RV_PER_PAGE;
  const slice=reviews.slice(start,start+RV_PER_PAGE);
  const qs=DB.reviewQs().sort((a,b)=>a.order-b.order);
  list.innerHTML=slice.map(r=>{
    const dt=new Date(r.createdAt);
    const dtStr=`${dt.getFullYear()}.${String(dt.getMonth()+1).padStart(2,'0')}.${String(dt.getDate()).padStart(2,'0')}, ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    const emojiList=['💬','✨','🌟','💫','🎯','🌸','💝','🎀','🌙','⭐'];
    let qas='';
    qs.forEach((q,qi)=>{const em=emojiList[qi%emojiList.length];qas+=`<div class="rv-q">${em} ${q.content}</div><div class="rv-a">${r.answers[q.id]||'(미작성)'}</div>`;});
    return `<div class="review-card">
      <div class="review-hd">
        <div class="review-who">${formatPartDate(r.participationDate)} 참석</div>
        <div class="review-when">${dtStr}</div>
      </div>
      ${qas}
    </div>`;
  }).join('');
  renderPagination('rv-pagination',rvPage,reviews.length,RV_PER_PAGE,'initRV');
}

// ═══════════════════════════════════════════════════
//  PAGE 7: FAQ
// ═══════════════════════════════════════════════════
function initFAQ(){
  const faqs=DB.faq().sort((a,b)=>a.order-b.order);
  const list=document.getElementById('faq-list');
  const empty=document.getElementById('faq-empty');
  if(faqs.length===0){empty.style.display='block';list.innerHTML='';return;}
  empty.style.display='none';
  list.innerHTML=faqs.map((f,i)=>`
    <div class="faq-item">
      <div class="faq-q" onclick="toggleFaq(${i})">
        <div><span class="faq-qmark">Q.</span>${f.question}</div>
        <span class="faq-chevron" id="faq-chev-${i}">▼</span>
      </div>
      <div class="faq-a" id="faq-ans-${i}">
        <div style="color:var(--txt2);font-size:13px;line-height:1.7;">${f.answer||'(답변 준비 중)'}</div>
      </div>
    </div>`).join('');
}

function toggleFaq(i){
  const ans=document.getElementById('faq-ans-'+i);
  const chev=document.getElementById('faq-chev-'+i);
  const q=ans.previousElementSibling;
  const isOpen=ans.classList.contains('open');
  ans.classList.toggle('open',!isOpen);
  q.classList.toggle('open',!isOpen);
}

// ═══════════════════════════════════════════════════
//  PAGE 9: ADMIN MAIN
// ═══════════════════════════════════════════════════
function initAdminMain(){
  setupAdmin('9','admin-main');
  const items=[
    {icon:'🏠',label:'메인 관리',page:'admin-main-manage'},
    {icon:'🎪',label:'이벤트 & 일정 관리',page:'admin-events'},
    {icon:'👥',label:'신청자 현황 관리',page:'admin-applicants'},
    {icon:'📋',label:'Preview 관리',page:'admin-preview'},
    {icon:'💬',label:'Review 관리',page:'admin-reviews'},
    {icon:'📝',label:'예약신청 안내문구 관리',page:'admin-res'},
    {icon:'🗂',label:'FAQ 관리',page:'admin-faq'},
    {icon:'📢',label:'팝업 관리',page:'admin-popup'},
    {icon:'🍹',label:'칵테일 주문 관리',page:'admin-order'},
  ];
  document.getElementById('admin-main-grid').innerHTML=items.map(it=>`
    <div class="admin-card-item" onclick="go('${it.page}')">
      <div class="admin-card-icon">${it.icon}</div>
      <div class="admin-card-label">${it.label}</div>
    </div>`).join('');
  renderPushArea();
}

// ═══════════════════════════════════════════════════
//  DATE PICKER (for page 10)
// ═══════════════════════════════════════════════════
let dpState={year:0,month:0,selectedY:0,selectedM:0,selectedD:0,callback:null};

function openDatePick(){
  const now=new Date();
  dpState.year=now.getFullYear();
  dpState.month=now.getMonth()+1;
  dpState.selectedY=dpState.selectedM=dpState.selectedD=0;
  document.getElementById('dpStep1').classList.add('active');
  document.getElementById('dpStep2').classList.remove('active');
  renderCalendar();
  document.getElementById('datePickModal').classList.add('open');
}

function renderCalendar(){
  const {year,month}=dpState;
  document.getElementById('calMonthLabel').textContent=`${year}년 ${month}월`;
  const firstDay=new Date(year,month-1,1).getDay();
  const daysInMonth=new Date(year,month,0).getDate();
  const today=new Date();
  const todayY=today.getFullYear(),todayM=today.getMonth()+1,todayD=today.getDate();
  const dows=['일','월','화','수','목','금','토'];
  let html=dows.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=0;i<firstDay;i++)html+=`<div class="cal-day empty"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const isToday=year===todayY&&month===todayM&&d===todayD;
    const isSel=dpState.selectedY===year&&dpState.selectedM===month&&dpState.selectedD===d;
    const cls=[isToday?'today':'',isSel?'selected':''].filter(Boolean).join(' ');
    html+=`<div class="cal-day ${cls}" onclick="selectCalDay(${d})">${d}</div>`;
  }
  document.getElementById('calGrid').innerHTML=html;
}

document.getElementById('calPrev').onclick=()=>{
  dpState.month--;if(dpState.month<1){dpState.month=12;dpState.year--;}
  renderCalendar();
};
document.getElementById('calNext').onclick=()=>{
  dpState.month++;if(dpState.month>12){dpState.month=1;dpState.year++;}
  renderCalendar();
};

function selectCalDay(d){
  dpState.selectedY=dpState.year;
  dpState.selectedM=dpState.month;
  dpState.selectedD=d;
  const dow=getDayKr(dpState.year,dpState.month,d);
  document.getElementById('dpSelectedDate').textContent=`${dpState.year}년 ${dpState.month}월 ${d}일(${dow})`;
  // Show time step
  document.getElementById('dpStep1').classList.remove('active');
  document.getElementById('dpStep2').classList.add('active');
  renderTimeGrid();
}

document.getElementById('dpBack').onclick=()=>{
  document.getElementById('dpStep2').classList.remove('active');
  document.getElementById('dpStep1').classList.add('active');
  renderCalendar();
};

function renderTimeGrid(){
  const times=['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00'];
  document.getElementById('timeGrid').innerHTML=times.map(t=>`
    <button class="time-btn" onclick="selectTime('${t}')">${t}</button>`).join('');
}

function selectTime(t){
  const {selectedY:y,selectedM:m,selectedD:d}=dpState;
  const [h,min]=t.split(':').map(Number);
  const text=formatScheduleText(y,m,d,h,min);
  // 통합 페이지 입력창 업데이트
  const evtInput=document.getElementById('evt-sched-input');
  if(evtInput){
    evtInput.value=text;
    const preview=document.getElementById('evt-sched-preview');
    if(preview){preview.textContent='✓ 선택: '+text;preview.style.display='block';}
  }
  // 구 일정 관리 페이지 입력창
  const oldInput=document.getElementById('sched-input');
  if(oldInput)oldInput.value=text;
  document.getElementById('datePickModal').classList.remove('open');
  window._pendingSched={year:y,month:m,day:d,hour:h,minute:min,displayText:text};
}

// ═══════════════════════════════════════════════════
//  PAGE 10: ADMIN SCHEDULES
// ═══════════════════════════════════════════════════
let schedPage=1;
const SCHED_PER_PAGE=5;

let schedFilterEvt='all';

function initAdminSchedules(page){
  setupAdmin('10','admin-schedules');
  schedPage=page||1;
  document.getElementById('sched-input').value='';
  window._pendingSched=null;
  // 이벤트 select 채우기
  const evtSel=document.getElementById('sched-event-select');
  const events=DB.events().filter(e=>e.isActive);
  evtSel.innerHTML='<option value="">이벤트를 선택하세요</option>'+events.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
  // 이벤트 필터 탭
  renderSchedEventTabs();
  renderSchedTable();
}

function renderSchedEventTabs(){
  const events=DB.events();
  const el=document.getElementById('sched-event-tabs');
  const all=[{id:'all',name:'전체'},...events];
  el.innerHTML=all.map(e=>`<button class="btn btn-sm ${schedFilterEvt===e.id?'btn-primary':'btn-secondary'}" onclick="setSchedFilterEvt('${e.id}')">${e.name}</button>`).join('');
}

function setSchedFilterEvt(evtId){
  schedFilterEvt=evtId;
  schedPage=1;
  renderSchedEventTabs();
  renderSchedTable();
}

function addSchedule(){
  if(!window._pendingSched){toast('날짜와 시간을 선택해주세요.','error');return;}
  const evtId=document.getElementById('sched-event-select').value;
  if(!evtId){toast('이벤트를 선택해주세요.','error');return;}
  const{year,month,day,hour,minute,displayText}=window._pendingSched;
  const schedules=DB.schedules();
  const newSched={
    id:uid(),year,month,day,hour,minute,displayText,
    eventId:evtId,
    isVisible:false,isPreviewActive:false,
    createdAt:Date.now(),
    order:schedules.length+1
  };
  schedules.push(newSched);
  // Re-order: sort by date desc, assign order
  schedules.sort((a,b)=>b.createdAt-a.createdAt);
  schedules.forEach((s,i)=>s.order=schedules.length-i);
  DB.saveSchedules(schedules);
  document.getElementById('sched-input').value='';
  window._pendingSched=null;
  toast('일정이 등록되었습니다.','success');
  initAdminSchedules(1);
}

function renderSchedTable(){
  const events=DB.events();
  let allScheds=DB.schedules().sort((a,b)=>b.createdAt-a.createdAt);
  allScheds.forEach((s,i)=>s.order=allScheds.length-i);
  const scheds=schedFilterEvt==='all'?allScheds:allScheds.filter(s=>s.eventId===schedFilterEvt);
  const tbody=document.getElementById('sched-tbody');
  const empty=document.getElementById('sched-empty');
  if(scheds.length===0){tbody.innerHTML='';empty.style.display='block';document.getElementById('sched-pagination').innerHTML='';return;}
  empty.style.display='none';
  const start=(schedPage-1)*SCHED_PER_PAGE;
  const slice=scheds.slice(start,start+SCHED_PER_PAGE);
  tbody.innerHTML=slice.map(s=>{
    const evt=events.find(e=>e.id===s.eventId);
    const evtName=evt?evt.name:'<span style="color:var(--txt3)">미지정</span>';
    return `<tr>
      <td>${evtName}</td>
      <td>${s.order}</td>
      <td>${s.displayText}</td>
      <td>
        <label class="toggle">
          <input type="checkbox" ${s.isVisible?'checked':''} onchange="toggleSchedVisible('${s.id}',this.checked)">
          <div class="toggle-track"></div>
        </label>
        ${isScheduleExpired(s)?'<span style="font-size:10px;color:var(--txt3);display:block;margin-top:2px;">종료됨</span>':''}
      </td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteSchedule('${s.id}')">삭제</button></td>
    </tr>`;
  }).join('');
  renderPagination('sched-pagination',schedPage,scheds.length,SCHED_PER_PAGE,'initAdminSchedules');
}

function toggleSchedVisible(id,val){
  const scheds=DB.schedules();
  const s=scheds.find(x=>x.id===id);
  if(s){
    if(val&&isScheduleExpired(s)){toast('종료된 일정은 다시 활성화할 수 없습니다.','error');return;}
    s.isVisible=val;DB.saveSchedules(scheds);
  }
}

function deleteSchedule(id){
  confirm2('정말 삭제하시겠습니까?',async()=>{
    const scheds=DB.schedules().filter(s=>s.id!==id);
    DB.saveSchedules(scheds);
    const removedApps=DB.applications().filter(a=>a.scheduleId===id);
    const filteredApps=DB.applications().filter(a=>a.scheduleId!==id);
    try{localStorage.setItem('sjt_applications',JSON.stringify(filteredApps));}catch(e){}
    DB.savePreviews(DB.previews().filter(p=>p.scheduleId!==id));
    await Promise.all(removedApps.map(a=>deleteApplicationFromSB(a.id)));
    toast('일정이 삭제되었습니다.','success');
    initAdminSchedules(1);
  });
}

function goApplicants(scheduleId){go('admin-applicants',{scheduleId});}

// ═══════════════════════════════════════════════════
//  PAGE: ADMIN EVENTS (재설계)
// ═══════════════════════════════════════════════════
function initAdminEvents(){
  setupAdmin('events','admin-events');
  initGenderTextCard();
  if(!evtDetailId){
    const events=DB.events();
    if(events.length>0){evtDetailId=events[0].id;appFieldsEvtId=events[0].id;}
  }
  renderEvtManageList();
  renderAdminEventTabs();
  if(evtDetailId)renderEvtDetailContent();
}

// ① 이벤트 관리 목록 (이름 편집 + 삭제)
function renderEvtManageList(){
  const events=DB.events();
  const el=document.getElementById('evt-manage-list');
  if(!el)return;
  if(events.length===0){el.innerHTML='<div class="empty-state" style="padding:12px;">등록된 이벤트가 없습니다.</div>';return;}
  el.innerHTML=events.map(e=>`
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--bd);flex-wrap:wrap;">
      <span id="evtm-name-${e.id}" style="font-size:14px;font-weight:500;color:var(--txt);flex:1;min-width:80px;">${e.name}</span>
      <input class="form-input" id="evtm-inp-${e.id}" value="${e.name}" style="display:none;flex:1;min-width:80px;padding:5px 8px;">
      <div style="display:flex;align-items:center;gap:4px;">
        <label class="toggle" title="사용자 탭 표시">
          <input type="checkbox" ${e.isActive?'checked':''} onchange="toggleEvtActive('${e.id}',this.checked)">
          <div class="toggle-track"></div>
        </label>
        <span style="font-size:11px;color:var(--txt3);">탭 노출</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <label class="toggle" title="파일 첨부 필수 여부">
          <input type="checkbox" ${e.fileRequired!==false?'checked':''} onchange="toggleEvtFileRequired('${e.id}',this.checked)">
          <div class="toggle-track"></div>
        </label>
        <span style="font-size:11px;color:var(--txt3);">파일 필수</span>
      </div>
      <button class="btn btn-secondary btn-sm" id="evtm-edit-${e.id}" onclick="startEvtNameEdit('${e.id}')">수정</button>
      <button class="btn btn-primary btn-sm" id="evtm-save-${e.id}" style="display:none;" onclick="saveEvtName('${e.id}')">저장</button>
      <button class="btn btn-danger btn-sm" ${e.id==='evt_default'?'disabled':''} onclick="deleteEvtById('${e.id}')">삭제</button>
    </div>`).join('');
}

function toggleEvtActive(evtId,val){
  const events=DB.events();
  const e=events.find(x=>x.id===evtId);
  if(e){e.isActive=val;DB.saveEvents(events);toast('저장되었습니다.','success');}
}

function toggleEvtFileRequired(evtId,val){
  const events=DB.events();
  const e=events.find(x=>x.id===evtId);
  if(e){e.fileRequired=val;DB.saveEvents(events);toast(val?'파일 첨부가 필수로 설정되었습니다.':'파일 첨부가 선택으로 변경되었습니다.','success');}
}

function startEvtNameEdit(evtId){
  document.getElementById('evtm-name-'+evtId).style.display='none';
  document.getElementById('evtm-inp-'+evtId).style.display='';
  document.getElementById('evtm-edit-'+evtId).style.display='none';
  document.getElementById('evtm-save-'+evtId).style.display='';
}

function saveEvtName(evtId){
  const name=document.getElementById('evtm-inp-'+evtId).value.trim();
  if(!name){toast('이벤트 이름을 입력해주세요.','error');return;}
  const events=DB.events();
  const e=events.find(x=>x.id===evtId);
  if(e){e.name=name;DB.saveEvents(events);toast('수정되었습니다.','success');}
  renderEvtManageList();
  renderAdminEventTabs();
}

function deleteEvtById(evtId){
  if(evtId==='evt_default'){toast('기본 이벤트는 삭제할 수 없습니다.','error');return;}
  confirm2('이벤트를 삭제하시겠습니까?\n(해당 이벤트의 일정·신청 데이터는 삭제되지 않습니다.)',()=>{
    const events=DB.events().filter(e=>e.id!==evtId);
    DB.saveEvents(events);
    if(evtDetailId===evtId){evtDetailId=events.length>0?events[0].id:null;appFieldsEvtId=evtDetailId;}
    toast('삭제되었습니다.','success');
    renderEvtManageList();
    renderAdminEventTabs();
    if(evtDetailId)renderEvtDetailContent();
    else document.getElementById('evt-detail-area').style.display='none';
  });
}

// ② 이벤트 탭 (일정 관리용)
function renderAdminEventTabs(){
  const events=DB.events();
  const el=document.getElementById('admin-event-tabs');
  if(!el)return;
  if(events.length===0){
    el.innerHTML='<span style="font-size:13px;color:var(--txt3);">이벤트를 먼저 추가해주세요.</span>';
    document.getElementById('evt-detail-area').style.display='none';
    return;
  }
  el.innerHTML=events.map(e=>`
    <button onclick="selectAdminEvent('${e.id}')" style="padding:9px 20px;border-radius:var(--r2);font-size:14px;font-weight:500;cursor:pointer;border:2px solid ${evtDetailId===e.id?'var(--gold)':'var(--bd)'};background:${evtDetailId===e.id?'var(--gold3)':'var(--bg4)'};color:${evtDetailId===e.id?'var(--gold)':'var(--txt2)'};transition:all .2s;font-family:'Noto Sans KR',sans-serif;">${e.name}</button>`).join('');
}

function selectAdminEvent(evtId){
  evtDetailId=evtId;appFieldsEvtId=evtId;evtSchedPage=1;
  renderAdminEventTabs();
  renderEvtDetailContent();
}

// ③ 선택된 이벤트 일정 콘텐츠
function renderEvtDetailContent(){
  const evt=DB.events().find(e=>e.id===evtDetailId);
  if(!evt){document.getElementById('evt-detail-area').style.display='none';return;}
  document.getElementById('evt-detail-area').style.display='';
  document.getElementById('evt-sched-input').value='';
  document.getElementById('evt-sched-preview').style.display='none';
  window._pendingSched=null;
  renderEvtSchedList();
  renderAppFieldsList();
}

function toggleAddEventForm(){
  const form=document.getElementById('add-event-form');
  const btn=document.getElementById('add-evt-toggle-btn');
  const isOpen=form.style.display!=='none';
  form.style.display=isOpen?'none':'';
  btn.textContent=isOpen?'+ 이벤트 추가':'✕ 닫기';
}

// 일정 카드 렌더링 (일정별 상세 설정)
function toggleEvtSchedExpired(){
  evtSchedShowExpired=!evtSchedShowExpired;
  evtSchedPage=1;
  renderEvtSchedList();
}

function renderEvtSchedList(){
  if(!evtDetailId)return;
  const allScheds=DB.schedules().sort((a,b)=>b.createdAt-a.createdAt);
  allScheds.forEach((s,i)=>s.order=allScheds.length-i);
  const allEvtScheds=allScheds.filter(s=>s.eventId===evtDetailId);
  const expiredCount=allEvtScheds.filter(s=>isScheduleExpired(s)).length;
  const scheds=evtSchedShowExpired?allEvtScheds:allEvtScheds.filter(s=>!isScheduleExpired(s));

  const listEl=document.getElementById('evt-sched-list');
  const empty=document.getElementById('evt-sched-empty');
  if(!listEl)return;

  // 숨기기/보이기 버튼 (종료 일정이 있을 때만 표시)
  const paginationEl=document.getElementById('evt-sched-pagination');
  let toggleBtnHtml='';
  if(expiredCount>0){
    toggleBtnHtml=`<div style="margin-top:10px;text-align:center;">
      <button class="btn btn-secondary btn-sm" onclick="toggleEvtSchedExpired()">
        ${evtSchedShowExpired?`▲ 종료된 일정 숨기기 (${expiredCount}개)`:`▼ 종료된 일정 보기 (${expiredCount}개)`}
      </button>
    </div>`;
  }

  if(scheds.length===0){
    listEl.innerHTML='';
    if(empty)empty.style.display='block';
    if(paginationEl)paginationEl.innerHTML=toggleBtnHtml;
    return;
  }
  if(empty)empty.style.display='none';
  const start=(evtSchedPage-1)*EVT_SCHED_PER_PAGE;
  const slice=scheds.slice(start,start+EVT_SCHED_PER_PAGE);
  listEl.innerHTML=slice.map(s=>`
    <div style="background:var(--bg4);border:1px solid var(--bd);border-radius:var(--r2);padding:14px 16px;margin-bottom:10px;">
      <!-- 헤더: 날짜 + 신청자 보기 + 삭제 -->
      <div class="flex-between mb8">
        <span style="font-size:14px;font-weight:600;color:var(--txt);">${s.displayText}</span>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-secondary btn-sm" onclick="goApplicants('${s.id}')">신청자 보기</button>
          <button class="btn btn-danger btn-sm" onclick="deleteEvtSchedule('${s.id}')">삭제</button>
        </div>
      </div>
      <!-- 이름 입력 -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <span style="font-size:12px;color:var(--txt2);white-space:nowrap;">일정 이름</span>
        <input class="form-input" style="flex:1;min-width:120px;padding:5px 9px;" placeholder="선택 사항 (예: 1회차, 특별 이벤트)" value="${s.name||''}" onblur="saveSchedField('${s.id}','name',this.value)" lang="ko">
      </div>
      <!-- 정원 -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:12px;color:var(--txt2);">남 정원</span>
          <input type="number" class="form-input" style="width:64px;padding:5px 8px;text-align:center;" min="1" max="100" value="${s.maleCapacity||12}" onblur="saveSchedField('${s.id}','maleCapacity',+this.value||12)">
          <span style="font-size:12px;color:var(--txt2);">명</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:12px;color:var(--txt2);">여 정원</span>
          <input type="number" class="form-input" style="width:64px;padding:5px 8px;text-align:center;" min="1" max="100" value="${s.femaleCapacity||12}" onblur="saveSchedField('${s.id}','femaleCapacity',+this.value||12)">
          <span style="font-size:12px;color:var(--txt2);">명</span>
        </div>
      </div>
      <!-- 토글 -->
      <div style="display:flex;gap:16px;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer;">
          <label class="toggle"><input type="checkbox" ${s.isVisible?'checked':''} onchange="saveSchedField('${s.id}','isVisible',this.checked)"><div class="toggle-track"></div></label>
          <span style="font-size:12px;color:var(--txt2);">신청 활성화${isScheduleExpired(s)?'<span style="color:var(--txt3);font-size:10px;"> (종료됨)</span>':''}</span>
        </label>
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer;">
          <label class="toggle"><input type="checkbox" ${s.isPreviewActive?'checked':''} onchange="saveSchedField('${s.id}','isPreviewActive',this.checked)"><div class="toggle-track"></div></label>
          <span style="font-size:12px;color:var(--txt2);">Preview 기능</span>
        </label>
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer;">
          <label class="toggle"><input type="checkbox" ${s.reviewEnabled?'checked':''} onchange="saveSchedField('${s.id}','reviewEnabled',this.checked)"><div class="toggle-track"></div></label>
          <span style="font-size:12px;color:var(--txt2);">Review 기능</span>
        </label>
      </div>
    </div>`).join('');
  renderPagination('evt-sched-pagination',evtSchedPage,scheds.length,EVT_SCHED_PER_PAGE,'evtSchedPageChange');
  if(paginationEl&&toggleBtnHtml){
    paginationEl.innerHTML+= toggleBtnHtml;
  }
}

function saveSchedField(schedId,field,value){
  const scheds=DB.schedules();
  const s=scheds.find(x=>x.id===schedId);
  if(s){
    if((field==='isVisible'||field==='isPreviewActive')&&value&&isScheduleExpired(s)){toast('종료된 일정은 다시 활성화할 수 없습니다.','error');return;}
    s[field]=value;
    DB.saveSchedules(scheds);
  }
}

// 구버전 호환
function renderEvtSchedTable(){renderEvtSchedList();}
function openEvtDetail(evtId){selectAdminEvent(evtId);}
function openAppFieldsConfig(evtId){selectAdminEvent(evtId);}
function closeEvtDetail(){evtDetailId=null;document.getElementById('evt-detail-area').style.display='none';renderAdminEventTabs();}
function toggleEventProp(evtId,prop,val){const events=DB.events();const e=events.find(x=>x.id===evtId);if(e){e[prop]=val;DB.saveEvents(events);toast('저장되었습니다.','success');}}
function deleteCurrentEvent(){deleteEvtById(evtDetailId);}
function startEvtSettingsEdit(){}
function saveEvtSettings(){}
function saveEvtSettingsProp(prop,val){toggleEventProp(evtDetailId,prop,val);}

function renderEventsTable(){
  const events=DB.events();
  const tbody=document.getElementById('events-tbody');
  const empty=document.getElementById('events-empty');
  if(!tbody)return;
  if(events.length===0){tbody.innerHTML='';if(empty)empty.style.display='block';return;}
  if(empty)empty.style.display='none';
  tbody.innerHTML=events.map(evt=>`
    <tr>
      <td>
        <span id="evt-name-txt-${evt.id}">${evt.name}</span>
        <input class="form-input" id="evt-name-inp-${evt.id}" value="${evt.name}" style="display:none;max-width:130px;">
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:4px;">
          <span id="evt-male-txt-${evt.id}" style="font-size:13px;">${evt.maleCapacity||12}</span>
          <input type="number" class="form-input" id="evt-male-inp-${evt.id}" value="${evt.maleCapacity||12}" min="1" max="100" style="display:none;width:56px;padding:4px 6px;text-align:center;">
        </div>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:4px;">
          <span id="evt-female-txt-${evt.id}" style="font-size:13px;">${evt.femaleCapacity||12}</span>
          <input type="number" class="form-input" id="evt-female-inp-${evt.id}" value="${evt.femaleCapacity||12}" min="1" max="100" style="display:none;width:56px;padding:4px 6px;text-align:center;">
        </div>
      </td>
      <td>
        <label class="toggle">
          <input type="checkbox" ${evt.isActive?'checked':''} onchange="toggleEventProp('${evt.id}','isActive',this.checked)">
          <div class="toggle-track"></div>
        </label>
      </td>
      <td>
        <label class="toggle">
          <input type="checkbox" ${evt.previewEnabled?'checked':''} onchange="toggleEventProp('${evt.id}','previewEnabled',this.checked)">
          <div class="toggle-track"></div>
        </label>
      </td>
      <td>
        <label class="toggle">
          <input type="checkbox" ${evt.reviewEnabled?'checked':''} onchange="toggleEventProp('${evt.id}','reviewEnabled',this.checked)">
          <div class="toggle-track"></div>
        </label>
      </td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="openEvtDetail('${evt.id}')" style="${evtDetailId===evt.id?'color:var(--gold);border-color:var(--gold);':''}">
          ${evtDetailId===evt.id?'✓ 관리중':'일정 관리'}
        </button>
      </td>
      <td>
        <button class="btn btn-secondary btn-sm" id="evt-edit-btn-${evt.id}" onclick="startEditEvent('${evt.id}')">수정</button>
        <button class="btn btn-primary btn-sm" id="evt-save-btn-${evt.id}" style="display:none;" onclick="saveEventName('${evt.id}')">저장</button>
      </td>
      <td>
        <button class="btn btn-danger btn-sm" ${evt.id==='evt_default'?'disabled title="기본 이벤트는 삭제 불가"':''} onclick="deleteEvent('${evt.id}')">삭제</button>
      </td>
    </tr>`).join('');
}

function addEvent(){
  const nameEl=document.getElementById('event-name-input');
  const name=nameEl.value.trim();
  if(!name){toast('이벤트 이름을 입력해주세요.','error');return;}
  const events=DB.events();
  if(events.find(e=>e.name===name)){toast('동일한 이름의 이벤트가 이미 있습니다.','error');return;}
  const newId='evt_'+uid();
  events.push({id:newId,name,isActive:true,previewEnabled:false,reviewEnabled:false,fileRequired:true});
  DB.saveEvents(events);
  nameEl.value='';
  document.getElementById('add-event-form').style.display='none';
  document.getElementById('add-evt-toggle-btn').textContent='+ 이벤트 추가';
  toast('이벤트가 추가되었습니다.','success');
  evtDetailId=newId;appFieldsEvtId=newId;
  renderEvtManageList();
  renderAdminEventTabs();
  renderEvtDetailContent();
}

function startEditEvent(evtId){
  document.getElementById('evt-name-txt-'+evtId).style.display='none';
  document.getElementById('evt-name-inp-'+evtId).style.display='';
  document.getElementById('evt-male-txt-'+evtId).style.display='none';
  document.getElementById('evt-male-inp-'+evtId).style.display='';
  document.getElementById('evt-female-txt-'+evtId).style.display='none';
  document.getElementById('evt-female-inp-'+evtId).style.display='';
  document.getElementById('evt-edit-btn-'+evtId).style.display='none';
  document.getElementById('evt-save-btn-'+evtId).style.display='';
}

function saveEventName(evtId){
  const name=document.getElementById('evt-name-inp-'+evtId).value.trim();
  if(!name){toast('이벤트 이름을 입력해주세요.','error');return;}
  const mCap=parseInt(document.getElementById('evt-male-inp-'+evtId).value)||12;
  const fCap=parseInt(document.getElementById('evt-female-inp-'+evtId).value)||12;
  const events=DB.events();
  const evt=events.find(e=>e.id===evtId);
  if(evt){evt.name=name;evt.maleCapacity=mCap;evt.femaleCapacity=fCap;DB.saveEvents(events);toast('수정되었습니다.','success');}
  renderEventsTable();
}

let appFieldsEvtId=null;
let evtDetailId=null;
let evtSchedPage=1;
const EVT_SCHED_PER_PAGE=8;
let evtSchedShowExpired=false;

function openEvtDatePick(){openDatePick();}

function addEvtSchedule(){
  if(!evtDetailId){toast('이벤트를 먼저 선택해주세요.','error');return;}
  const p=window._pendingSched;
  if(!p){toast('날짜와 시간을 선택해주세요.','error');return;}
  const{year,month,day,hour,minute,displayText}=p;
  const schedules=DB.schedules();
  schedules.push({
    id:uid(),year,month,day,hour,minute,displayText,
    eventId:evtDetailId,
    name:'',
    maleCapacity:12,femaleCapacity:12,
    isVisible:false,isPreviewActive:false,reviewEnabled:false,
    createdAt:Date.now(),order:schedules.length+1
  });
  schedules.sort((a,b)=>b.createdAt-a.createdAt);
  schedules.forEach((s,i)=>s.order=schedules.length-i);
  DB.saveSchedules(schedules);
  document.getElementById('evt-sched-input').value='';
  document.getElementById('evt-sched-preview').style.display='none';
  window._pendingSched=null;
  toast('일정이 등록되었습니다.','success');
  evtSchedPage=1;
  renderEvtSchedList();
}

function evtSchedPageChange(p){evtSchedPage=p;renderEvtSchedList();}

function toggleEvtSchedProp(id,prop,val){
  const scheds=DB.schedules();
  const s=scheds.find(x=>x.id===id);
  if(s){
    if(isScheduleExpired(s)){toast('지난 일정은 변경할 수 없습니다.','error');return;}
    s[prop]=val;DB.saveSchedules(scheds);
  }
}

function deleteEvtSchedule(id){
  confirm2('정말 삭제하시겠습니까?',async()=>{
    DB.saveSchedules(DB.schedules().filter(s=>s.id!==id));
    const removedApps=DB.applications().filter(a=>a.scheduleId===id);
    const filteredApps=DB.applications().filter(a=>a.scheduleId!==id);
    try{localStorage.setItem('sjt_applications',JSON.stringify(filteredApps));}catch(e){}
    DB.savePreviews(DB.previews().filter(p=>p.scheduleId!==id));
    await Promise.all(removedApps.map(a=>deleteApplicationFromSB(a.id)));
    toast('일정이 삭제되었습니다.','success');
    renderEvtSchedTable();
  });
}

function openAppFieldsConfig(evtId,evtName){
  openEvtDetail(evtId);
}

function renderAppFieldsList(){
  if(!appFieldsEvtId)return;
  const fields=DB.getEventAppFields(appFieldsEvtId);
  const el=document.getElementById('evt-appfields-list');
  if(!el)return;
  el.innerHTML=fields.map(f=>`
    <div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--bd);gap:8px;">
      <div style="display:flex;align-items:center;gap:8px;flex:1;">
        ${f.isDefault
          ?`<span style="font-size:13px;color:var(--txt);">${f.label}</span>`
          :`<input class="form-input" style="max-width:180px;" id="af-lbl-${f.id}" value="${f.label}" onblur="saveCustomAppFieldLabel('${f.id}',this.value)">`
        }
        ${f.isDefault?'<span class="badge badge-on" style="font-size:10px;">기본</span>':''}
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <label class="toggle">
          <input type="checkbox" ${f.enabled?'checked':''} onchange="toggleAppField('${f.id}',this.checked)">
          <div class="toggle-track"></div>
        </label>
        ${!f.isDefault?`<button class="btn btn-danger btn-sm" onclick="deleteCustomAppField('${f.id}')">삭제</button>`:''}
      </div>
    </div>`).join('');
}

function toggleAppField(fieldId,val){
  if(!appFieldsEvtId)return;
  const fields=DB.getEventAppFields(appFieldsEvtId);
  const f=fields.find(x=>x.id===fieldId);
  if(f){f.enabled=val;DB.saveEventAppFields(appFieldsEvtId,fields);toast('저장되었습니다.','success');}
}

function saveCustomAppFieldLabel(fieldId,val){
  if(!appFieldsEvtId||!val.trim())return;
  const fields=DB.getEventAppFields(appFieldsEvtId);
  const f=fields.find(x=>x.id===fieldId);
  if(f&&f.label!==val.trim()){f.label=val.trim();DB.saveEventAppFields(appFieldsEvtId,fields);toast('저장되었습니다.','success');}
}

function addCustomAppField(){
  if(!appFieldsEvtId)return;
  const label=document.getElementById('evt-custom-field-label').value.trim();
  if(!label){toast('항목 이름을 입력해주세요.','error');return;}
  const fields=DB.getEventAppFields(appFieldsEvtId);
  fields.push({id:'af_c_'+uid(),label,key:'custom_'+uid(),type:'text',enabled:true,isDefault:false});
  DB.saveEventAppFields(appFieldsEvtId,fields);
  document.getElementById('evt-custom-field-label').value='';
  toast('항목이 추가되었습니다.','success');
  renderAppFieldsList();
}

function deleteCustomAppField(fieldId){
  if(!appFieldsEvtId)return;
  confirm2('이 항목을 삭제하시겠습니까?',()=>{
    const fields=DB.getEventAppFields(appFieldsEvtId).filter(f=>f.id!==fieldId);
    DB.saveEventAppFields(appFieldsEvtId,fields);
    toast('삭제되었습니다.','success');
    renderAppFieldsList();
  });
}

// ═══════════════════════════════════════════════════
//  PAGE 11: ADMIN APPLICANTS
// ═══════════════════════════════════════════════════
let currentSchedId=null;


// ═══════════════════════════════════════════════════
//  수기 신청자 입력
// ═══════════════════════════════════════════════════
let meState={gender:null,number:null};

function openManualEntry(){
  if(!currentSchedId){toast('일정을 먼저 선택해주세요.','error');return;}
  meState={gender:null,number:null};
  document.getElementById('me-gender-male').classList.remove('selected');
  document.getElementById('me-gender-female').classList.remove('selected');
  document.getElementById('me-name').value='';
  document.getElementById('me-birth').value='';
  document.getElementById('me-phone').value='';
  document.getElementById('me-job').value='';
  document.getElementById('me-err').style.display='none';
  document.getElementById('me-num-grid').innerHTML='<div class="empty-state" style="padding:8px;font-size:12px;">성별을 먼저 선택하세요</div>';
  document.getElementById('manualEntryModal').classList.add('open');
}

function closeManualEntry(){
  document.getElementById('manualEntryModal').classList.remove('open');
}

function selectMEGender(g){
  meState.gender=g;
  meState.number=null;
  document.getElementById('me-gender-male').classList.toggle('selected',g==='남');
  document.getElementById('me-gender-female').classList.toggle('selected',g==='여');
  renderMENumGrid();
}

function renderMENumGrid(){
  const taken=getTakenNumbers(currentSchedId,meState.gender);
  const capacity=DB.getEvtCapacity(currentSchedId,meState.gender);
  let html='';
  for(let i=1;i<=capacity;i++){
    const isTaken=taken.includes(i);
    const isSel=meState.number===i;
    const cls='num-btn'+(isTaken?' taken':'')+(isSel?' selected':'');
    const attrs=isTaken?'disabled':`onclick="selectMENum(${i})"`;
    html+=`<button class="${cls}" ${attrs}>${i}번</button>`;
  }
  document.getElementById('me-num-grid').innerHTML=html;
}

function selectMENum(n){
  meState.number=n;
  renderMENumGrid();
}

function formatMEPhone(el){
  let v=el.value.replace(/\D/g,'').slice(0,11);
  if(v.length>=8)v=v.slice(0,3)+'-'+v.slice(3,7)+'-'+v.slice(7);
  else if(v.length>=4)v=v.slice(0,3)+'-'+v.slice(3);
  el.value=v;
}

function saveManualEntry(){
  const err=document.getElementById('me-err');
  err.style.display='none';

  const gender=meState.gender;
  const number=meState.number;
  const name=document.getElementById('me-name').value.trim();
  const birth=document.getElementById('me-birth').value.trim();
  const phone=document.getElementById('me-phone').value.trim();
  const job=document.getElementById('me-job').value.trim();

  if(!gender){err.textContent='성별을 선택해주세요.';err.style.display='block';return;}
  if(!number){err.textContent='번호를 선택해주세요.';err.style.display='block';return;}
  if(!name){err.textContent='이름을 입력해주세요.';err.style.display='block';return;}
  if(birth.length!==8){err.textContent='생년월일을 8자리로 입력해주세요.';err.style.display='block';return;}
  if(phone.length<12){err.textContent='전화번호를 입력해주세요.';err.style.display='block';return;}
  if(!job){err.textContent='직업을 입력해주세요.';err.style.display='block';return;}

  // 중복 번호 재확인
  const taken=getTakenNumbers(currentSchedId,gender);
  if(taken.includes(number)){err.textContent='이미 신청된 번호입니다.';err.style.display='block';renderMENumGrid();return;}

  const now=Date.now();
  const app={
    id:uid(),scheduleId:currentSchedId,gender,number,name,
    birthdate:birth,phone,occupation:job,
    fileName:'',fileData:'',fileSubmittedAt:now,submittedAt:now
  };
  const apps=DB.applications();
  apps.push(app);
  DB.saveApplications(apps);
  closeManualEntry();
  renderApplicants();
  toast('수기 입력이 완료되었습니다.','success');
  if(_sb)_sb.from('app_data').upsert({key:'app_'+app.id,value:JSON.stringify(app)}).catch(e=>console.warn('Manual entry sync failed:',e.message));
}

function renderApplicants(){
  if(!currentSchedId){
    document.getElementById('applicants-content').innerHTML='<div class="empty-state">일정을 선택해주세요.</div>';
    return;
  }
  const apps=DB.applications().filter(a=>a.scheduleId===currentSchedId);
  const now=Date.now();
  const el=document.getElementById('applicants-content');
  el.innerHTML='';
  let fullHtml='';
  ['남','여'].forEach(gender=>{
    const gApps=apps.filter(a=>a.gender===gender).sort((a,b)=>a.number-b.number);
    let html='<div class="card"><div class="card-hd">'+gender+'자</div>';
    if(gApps.length===0){html+='<div class="empty-state" style="padding:16px;">신청자가 없습니다.</div>';}
    else{
      html+='<div class="table-wrap"><table class="data-table"><thead><tr><th>번호</th><th>이름</th><th>생년월일</th><th>직업</th><th>전화번호</th><th>파일</th><th>삭제</th></tr></thead><tbody>';
      gApps.forEach(a=>{
        const expired=a.fileName&&(now-a.fileSubmittedAt>30*24*60*60*1000);
        const hasFile=a.fileName&&!expired;
        const fileBtn=hasFile
          ?`<button class="btn btn-secondary btn-sm" onclick="downloadFile('${a.id}')">다운로드</button>`
          :(a.fileName?'<span class="text-err text-sm">만료됨</span>':'<span class="text-muted text-sm">없음</span>');
        html+=`<tr><td>${a.number}번</td><td>${a.name}</td><td>${a.birthdate}</td>`
          +`<td>${a.occupation}</td><td>${a.phone}</td><td>${fileBtn}</td>`
          +`<td><button class="btn btn-danger btn-sm" onclick="deleteApplicant('${a.id}','${gender}',${a.number})">삭제</button></td></tr>`;
      });
      html+='</tbody></table></div>';
    }
    html+='</div>';
    fullHtml+=html;
  });
  el.innerHTML=fullHtml;
}

async function downloadFile(appId){
  if(!_sb){toast('Supabase 연결이 없습니다.','error');return;}
  toast('파일 불러오는 중...','info');
  try{
    const{data,error}=await _sb.from('app_data').select('value').eq('key','app_'+appId).maybeSingle();
    if(error)throw error;
    if(!data||!JSON.parse(data.value).fileData){toast('파일이 없습니다.','error');return;}
    const app=JSON.parse(data.value);
    const link=document.createElement('a');
    link.href=app.fileData;link.download=app.fileName||'file';
    link.click();
  }catch(e){
    console.error('Download failed:',e);
    toast('파일 다운로드에 실패했습니다.','error');
  }
}

function deleteApplicant(appId,gender,number){
  confirm2('정말 삭제하시겠습니까?\n(해당 번호가 다시 활성화됩니다.)',async()=>{
    const filtered=DB.applications().filter(a=>a.id!==appId);
    try{localStorage.setItem('sjt_applications',JSON.stringify(filtered));}catch(e){}
    const sched=currentSchedId;
    DB.savePreviews(DB.previews().filter(p=>!(p.scheduleId===sched&&p.gender===gender&&p.number===number)));
    await deleteApplicationFromSB(appId);
    toast('신청자 정보가 삭제되었습니다.','success');
    document.getElementById('applicants-content').innerHTML='';
    renderApplicants();
  });
}

// Expire file check
function checkExpiredFiles(){
  const now=Date.now();
  let apps=DB.applications();
  let changed=false;
  apps=apps.map(a=>{
    if(a.fileData&&(now-a.fileSubmittedAt>30*24*60*60*1000)){
      changed=true;
      return{...a,fileData:'',fileName:''};
    }
    return a;
  });
  if(changed)DB.saveApplications(apps);
}

// ═══════════════════════════════════════════════════
//  PAGE 12: ADMIN PREVIEW MANAGEMENT
// ═══════════════════════════════════════════════════
let apState={scheduleId:null,selected:null};
let pvFilterEvt='evt_default';

function initAdminPreview(){
  setupAdmin('12','admin-preview');
  apState={scheduleId:null,selected:null};
  renderPVEventTabs();
  updatePVEvtWriteToggle();
  initGuideCard('pv','previewGuide');
  renderAPSchedSection();
  renderPQTable();
  buildAPScheduleMenu();
  document.getElementById('ap-schedule-val').textContent='일정을 선택해주세요.';
  document.getElementById('ap-people-area').style.display='none';
  setupTopBtn('ap-top-btn');
}

function updatePVEvtWriteToggle(){
  const el=document.getElementById('pv-evt-write-enabled');
  if(!el)return;
  const events=DB.events();
  const evt=events.find(e=>e.id===pvFilterEvt);
  el.checked=evt?!!(evt.previewEnabled):true;
}

function toggleEventPreviewWrite(val){
  const events=DB.events();
  const evt=events.find(e=>e.id===pvFilterEvt);
  if(evt){evt.previewEnabled=val;DB.saveEvents(events);toast(val?'Preview 작성이 활성화되었습니다.':'Preview 작성이 비활성화되었습니다.',val?'success':'info');}
}

function renderPVEventTabs(){
  const events=DB.events();
  const el=document.getElementById('pv-event-tabs');
  if(!el)return;
  el.innerHTML=events.map(e=>`<button class="btn btn-sm ${pvFilterEvt===e.id?'btn-primary':'btn-secondary'}" onclick="setPVFilterEvt('${e.id}')">${e.name}</button>`).join('');
}

function setPVFilterEvt(evtId){
  pvFilterEvt=evtId;
  renderPVEventTabs();
  updatePVEvtWriteToggle();
  renderPQTable();
  renderAPSchedSection();
  buildAPScheduleMenu();
  document.getElementById('ap-schedule-val').textContent='일정을 선택해주세요.';
  document.getElementById('ap-people-area').style.display='none';
}

function buildAPScheduleMenu(){
  let scheds=DB.schedules().sort((a,b)=>b.createdAt-a.createdAt);
  if(pvFilterEvt)scheds=scheds.filter(s=>s.eventId===pvFilterEvt);
  const menu=document.getElementById('ap-schedule-menu');
  if(!menu)return;
  if(scheds.length===0){menu.innerHTML='<div class="dropdown-empty">등록된 일정이 없습니다.</div>';}
  else{menu.innerHTML=scheds.map(s=>`<div class="dropdown-item" onclick="selectAPSchedule('${s.id}','${s.displayText}')">${s.displayText}</div>`).join('');}
}

function renderAPSchedSection(){
  let allScheds=DB.schedules().sort((a,b)=>b.createdAt-a.createdAt);
  allScheds.forEach((s,i)=>s.order=allScheds.length-i);
  const scheds=pvFilterEvt?allScheds.filter(s=>s.eventId===pvFilterEvt):allScheds;
  const tbody=document.getElementById('ap-sched-tbody');
  const empty=document.getElementById('ap-sched-empty');
  if(!tbody)return;
  if(scheds.length===0){if(tbody)tbody.innerHTML='';if(empty)empty.style.display='block';return;}
  if(empty)empty.style.display='none';
  const start=(apSchedPage-1)*SCHED_PER_PAGE;
  const slice=scheds.slice(start,start+SCHED_PER_PAGE);
  tbody.innerHTML=slice.map(s=>`
    <tr>
      <td>${s.order}</td>
      <td>${s.displayText}</td>
      <td style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <label class="toggle">
          <input type="checkbox" ${s.isPreviewActive?'checked':''} ${isScheduleExpired(s)?'disabled':''} onchange="togglePQSchedActive('${s.id}',this.checked)">
          <div class="toggle-track"></div>
        </label>
        ${isScheduleExpired(s)
          ?'<span style="font-size:10px;color:var(--txt3);">종료됨</span>'
          :`<button class="btn btn-secondary btn-sm" data-sid="${s.id}" onclick="applyQuestionSnapshot(this.dataset.sid)" style="font-size:11px;padding:4px 8px;">변경된 질문 적용</button>`
        }
      </td>
    </tr>`).join('');
  renderPagination('ap-sched-pagination',apSchedPage,scheds.length,SCHED_PER_PAGE,'apSchedPageChange');
}
let apSchedPage=1;
function apSchedPageChange(p){apSchedPage=p;renderAPSchedSection();}

function selectAPSchedule(id,text){
  apState.scheduleId=id;apState.selected=null;
  document.getElementById('ap-schedule-val').textContent=text;
  document.getElementById('ap-schedule-btn').classList.remove('open');
  document.getElementById('ap-schedule-menu').classList.remove('open');
  document.getElementById('ap-people-area').style.display='block';
  renderAPGrid();
  document.getElementById('ap-content-area').innerHTML='';
}

function renderAPGrid(){
  const previews=DB.previews();
  ['male','female'].forEach(g=>{
    const gender=g==='male'?'남':'여';
    const grid=document.getElementById(`ap-${g}-grid`);
    const capacity=DB.getEvtCapacity(apState.scheduleId,gender);
    let html='';
    for(let i=1;i<=capacity;i++){
      const isActive=apState.selected&&apState.selected.gender===gender&&apState.selected.number===i;
      const prev=previews.find(p=>p.scheduleId===apState.scheduleId&&p.gender===gender&&p.number===i);
      const hasPreview=!isActive&&prev&&prev.answers&&Object.values(prev.answers).some(v=>v&&v.trim());
      const cls='person-btn'+(isActive?' active':hasPreview?' has-preview':'');
      html+=`<button class="${cls}" onclick="selectAPPerson('${gender}',${i})">${gender}자 ${i}번</button>`;
    }
    grid.innerHTML=html;
  });
}

function selectAPPerson(gender,number){
  apState.selected={gender,number};
  renderAPGrid();
  renderAPContent();
}

function renderAPContent(){
  if(!apState.selected)return;
  const{scheduleId}=apState;
  const{gender,number}=apState.selected;
  const prev=DB.previews().find(p=>p.scheduleId===scheduleId&&p.gender===gender&&p.number===number);
  const qs=getScheduleQuestions(apState.scheduleId);
  let html=`<div class="card"><div class="flex-between mb16">
    <div class="card-hd" style="margin-bottom:0;border:none;padding:0;">${gender}자 ${number}번 Preview</div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-secondary btn-sm" id="ap-edit-btn" onclick="toggleAPEdit()">수정</button>
      <button class="btn btn-danger btn-sm" onclick="resetAPPreview()">초기화</button>
    </div>
  </div>`;
  if(qs.length===0){html+='<div class="empty-state">등록된 질문이 없습니다.</div>';}
  else{
    qs.forEach(q=>{
      const ans=prev?prev.answers[q.id]||'':'';
      html+=`<div class="form-group">
        <label class="form-label">Q${q.order}. ${q.content}</label>
        <textarea class="form-textarea" id="ap-ans-${q.id}" disabled>${ans}</textarea>
      </div>`;
    });
  }
  html+='</div>';
  document.getElementById('ap-content-area').innerHTML=html;
}

function toggleAPEdit(){
  const btn=document.getElementById('ap-edit-btn');
  const qs=getScheduleQuestions(apState.scheduleId);
  const isEditing=btn.textContent==='저장';
  if(isEditing){
    // Save
    const{scheduleId}=apState;
    const{gender,number}=apState.selected;
    const answers={};
    qs.forEach(q=>{
      const el=document.getElementById('ap-ans-'+q.id);
      answers[q.id]=el?el.value.trim():'';
    });
    const prevs=DB.previews();
    const idx=prevs.findIndex(p=>p.scheduleId===scheduleId&&p.gender===gender&&p.number===number);
    const entry={scheduleId,gender,number,answers,updatedAt:Date.now()};
    if(idx>=0)prevs[idx]=entry;else prevs.push(entry);
    DB.savePreviews(prevs);
    qs.forEach(q=>{const el=document.getElementById('ap-ans-'+q.id);if(el)el.disabled=true;});
    btn.textContent='수정';
    renderAPGrid();
    toast('저장되었습니다.','success');
  }else{
    qs.forEach(q=>{const el=document.getElementById('ap-ans-'+q.id);if(el)el.disabled=false;});
    btn.textContent='저장';
  }
}

function resetAPPreview(){
  confirm2('정말 초기화 시키겠습니까?',()=>{
    const{scheduleId}=apState;
    const{gender,number}=apState.selected;
    DB.savePreviews(DB.previews().filter(p=>!(p.scheduleId===scheduleId&&p.gender===gender&&p.number===number)));
    renderAPGrid();
    renderAPContent();
    toast('초기화되었습니다.','success');
  });
}

// ═══════════════════════════════════════════════════
//  PAGE 13: ADMIN REVIEWS
// ═══════════════════════════════════════════════════
let arPage=1;
let rvFilterEvt='evt_default';

function initAdminReviews(page){
  setupAdmin('13','admin-reviews');
  arPage=page||1;
  renderRVEventTabs();
  updateRVEvtWriteToggle();
  renderRVFieldsConfig();
  initGuideCard('rv','reviewGuide');
  renderRQTable();
  initRQNotice();
  renderARList();
}

function updateRVEvtWriteToggle(){
  const el=document.getElementById('rv-evt-write-enabled');
  if(!el)return;
  const evt=DB.events().find(e=>e.id===rvFilterEvt);
  el.checked=evt?!!(evt.reviewEnabled):true;
}

function toggleEventReviewWrite(val){
  const events=DB.events();
  const evt=events.find(e=>e.id===rvFilterEvt);
  if(evt){evt.reviewEnabled=val;DB.saveEvents(events);toast(val?'Review 작성이 활성화되었습니다.':'Review 작성이 비활성화되었습니다.',val?'success':'info');}
}

function renderRVFieldsConfig(){
  const evtId=rvFilterEvt||'evt_default';
  const fields=DB.getEventReviewFields(evtId);
  const el=document.getElementById('rv-fields-config');
  if(!el)return;
  el.innerHTML=fields.map(f=>`
    <div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--bd);">
      <span style="font-size:13px;color:var(--txt);">${f.label}</span>
      <label class="toggle">
        <input type="checkbox" ${f.enabled?'checked':''} onchange="toggleRVField('${f.id}',this.checked)">
        <div class="toggle-track"></div>
      </label>
    </div>`).join('');
}

function toggleRVField(fieldId,val){
  const evtId=rvFilterEvt||'evt_default';
  const fields=DB.getEventReviewFields(evtId);
  const f=fields.find(x=>x.id===fieldId);
  if(f){f.enabled=val;DB.saveEventReviewFields(evtId,fields);toast('저장되었습니다.','success');}
}

function renderRVEventTabs(){
  const events=DB.events();
  const el=document.getElementById('rv-event-tabs');
  if(!el)return;
  el.innerHTML=events.map(e=>`<button class="btn btn-sm ${rvFilterEvt===e.id?'btn-primary':'btn-secondary'}" onclick="setRVFilterEvt('${e.id}')">${e.name}</button>`).join('');
}

function setRVFilterEvt(evtId){
  rvFilterEvt=evtId;
  arPage=1;
  renderRVEventTabs();
  updateRVEvtWriteToggle();
  renderRVFieldsConfig();
  renderRQTable();
  renderARList();
}

function initRQNotice(){
  const notice=DB.reviewNotice();
  const disp=document.getElementById('rq-notice-display');
  const inp=document.getElementById('rq-notice-input');
  if(disp)disp.textContent=notice;
  if(inp)inp.value=notice;
}

function renderARList(){
  let allReviews=DB.reviews().sort((a,b)=>b.createdAt-a.createdAt);
  // 이벤트 필터: review에 eventId 있으면 필터, 없으면 기본 이벤트로 간주
  const reviews=rvFilterEvt==='all'?allReviews:allReviews.filter(r=>(!r.eventId&&rvFilterEvt==='evt_default')||r.eventId===rvFilterEvt);
  const empty=document.getElementById('ar-empty');
  const list=document.getElementById('ar-list');
  if(reviews.length===0){empty.style.display='block';list.innerHTML='';document.getElementById('ar-pagination').innerHTML='';return;}
  empty.style.display='none';
  const start=(arPage-1)*RV_PER_PAGE;
  const slice=reviews.slice(start,start+RV_PER_PAGE);
  const qs=DB.eventReviewQs(rvFilterEvt).sort((a,b)=>a.order-b.order);
  list.innerHTML=slice.map(r=>{
    const dt=new Date(r.createdAt);
    const dtStr=`${dt.getFullYear()}.${String(dt.getMonth()+1).padStart(2,'0')}.${String(dt.getDate()).padStart(2,'0')}, ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    let qas='';
    qs.forEach(q=>{qas+=`<div class="rv-q">Q${q.order}. ${q.content}</div><div class="rv-a">${r.answers[q.id]||'(미작성)'}</div>`;});
    return `<div class="review-card">
      <div class="review-hd">
        <div class="review-who">${formatPartDate(r.participationDate)} 참석</div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="review-when">${dtStr}</span>
          <button class="btn btn-danger btn-sm" onclick="deleteReview('${r.id}')">삭제</button>
        </div>
      </div>
      ${qas}
    </div>`;
  }).join('');
  renderPagination('ar-pagination',arPage,reviews.length,RV_PER_PAGE,'initAdminReviews');
}

function deleteReview(id){
  confirm2('정말 삭제하시겠습니까?',()=>{
    DB.saveReviews(DB.reviews().filter(r=>r.id!==id));
    toast('리뷰가 삭제되었습니다.','success');
    initAdminReviews(1);
  });
}

// ═══════════════════════════════════════════════════
//  PAGE 15: ADMIN RESERVATION METHOD
// ═══════════════════════════════════════════════════
let resEvtFilter='global';

function initAdminRes(){
  setupAdmin('15','admin-res');
  renderResEventTabs();
  renderResParts();
}

function renderResEventTabs(){
  const el=document.getElementById('res-event-tabs');
  if(!el)return;
  const events=DB.events();
  const all=[{id:'global',name:'기본 (공통)'},...events];
  el.innerHTML=all.map(e=>`
    <button class="btn btn-sm ${resEvtFilter===e.id?'btn-primary':'btn-secondary'}" onclick="setResEvtFilter('${e.id}')">
      ${e.name}
    </button>`).join('');
}

function setResEvtFilter(evtId){
  resEvtFilter=evtId;
  renderResEventTabs();
  renderResParts();
}

function renderResParts(){
  const rm=DB.getEventResMethod(resEvtFilter);
  const isCustom=resEvtFilter!=='global'&&DB.get('resMethod_'+resEvtFilter,null)!==null;
  const resetBtn=resEvtFilter!=='global'?`<button class="btn btn-secondary btn-sm" onclick="resetResMethod()" title="기본 설정으로 초기화">${isCustom?'⟲ 기본값으로 초기화':'(기본값 사용 중)'}</button>`:'';

  // Part 1
  document.getElementById('res-part1-card').innerHTML=`
    <div class="flex-between mb8">
      <div class="card-hd" style="margin-bottom:0;border:none;padding:0;">파트 1 - DM 안내 문구</div>
      <div style="display:flex;gap:6px;">${resetBtn}<button class="btn btn-secondary btn-sm" id="res1-btn" onclick="toggleResPart(1)">수정</button></div>
    </div>
    <div id="res1-display" class="res-content" style="white-space:pre-line;">${rm.part1}</div>
    <div id="res1-edit" style="display:none;">
      <textarea class="form-textarea" id="res1-input" style="min-height:120px;">${rm.part1}</textarea>
    </div>`;

  // Part 2
  document.getElementById('res-part2-card').innerHTML=`
    <div class="flex-between mb8">
      <div class="card-hd" style="margin-bottom:0;border:none;padding:0;">파트 2 - 계좌 정보</div>
      <button class="btn btn-secondary btn-sm" id="res2-btn" onclick="toggleResPart(2)">수정</button>
    </div>
    <div id="res2-display">
      <div style="margin-bottom:6px;"><span style="color:var(--txt2);">은행:</span> <span>${rm.bankName}</span></div>
      <div style="margin-bottom:6px;"><span style="color:var(--txt2);">예금주:</span> <span>${rm.accountHolder}</span></div>
      <div><span style="color:var(--txt2);">계좌번호:</span> <span class="text-gold">${rm.accountNumber}</span></div>
    </div>
    <div id="res2-edit" style="display:none;">
      <div class="form-group"><label class="form-label">은행명</label><input class="form-input" id="res2-bank" lang="ko" inputmode="text" value="${rm.bankName}"></div>
      <div class="form-group"><label class="form-label">예금주</label><input class="form-input" id="res2-holder" lang="ko" inputmode="text" value="${rm.accountHolder}"></div>
      <div class="form-group"><label class="form-label">계좌번호</label><input class="form-input" id="res2-num" value="${rm.accountNumber}"></div>
    </div>`;

  // Part 3
  document.getElementById('res-part3-card').innerHTML=`
    <div class="flex-between mb8">
      <div class="card-hd" style="margin-bottom:0;border:none;padding:0;">파트 3 - 주의사항</div>
      <button class="btn btn-secondary btn-sm" id="res3-btn" onclick="toggleResPart(3)">수정</button>
    </div>
    <div id="res3-display" class="res-content" style="white-space:pre-line;">${rm.part3}</div>
    <div id="res3-edit" style="display:none;">
      <textarea class="form-textarea" id="res3-input" style="min-height:80px;">${rm.part3}</textarea>
    </div>`;
}

function resetResMethod(){
  if(resEvtFilter==='global')return;
  confirm2('기본값으로 초기화하시겠습니까?\n(이 이벤트의 커스텀 설정이 삭제됩니다.)',()=>{
    localStorage.removeItem('sjt_resMethod_'+resEvtFilter);
    renderResParts();
    toast('기본값으로 초기화되었습니다.','success');
  });
}

function toggleResPart(part){
  const display=document.getElementById(`res${part}-display`);
  const edit=document.getElementById(`res${part}-edit`);
  const btn=document.getElementById(`res${part}-btn`);
  const isEditing=btn.textContent==='저장';
  if(isEditing){
    const rm=DB.getEventResMethod(resEvtFilter);
    if(part===1){rm.part1=document.getElementById('res1-input').value;display.innerHTML=rm.part1.replace(/\n/g,'<br>');}
    else if(part===2){
      rm.bankName=document.getElementById('res2-bank').value;
      rm.accountHolder=document.getElementById('res2-holder').value;
      rm.accountNumber=document.getElementById('res2-num').value;
    }
    else if(part===3){rm.part3=document.getElementById('res3-input').value;display.innerHTML=rm.part3.replace(/\n/g,'<br>');}
    DB.saveEventResMethod(resEvtFilter,rm);
    display.style.display='';edit.style.display='none';btn.textContent='수정';
    if(part===2)renderResParts();
    toast('저장되었습니다.','success');
  }else{
    display.style.display='none';edit.style.display='block';btn.textContent='저장';
  }
}

// ═══════════════════════════════════════════════════
//  PAGE 16: ADMIN PREVIEW QUESTIONS
// ═══════════════════════════════════════════════════
let pqSchedPage=1;

function initAdminPQ(page){
  setupAdmin('16','admin-pq');
  pqSchedPage=page||1;
  renderPQTable();
  renderPQSchedTable();
}

function renderPQTable(){
  const qs=DB.eventPreviewQs(pvFilterEvt).sort((a,b)=>a.order-b.order);
  const tbody=document.getElementById('pq-tbody');
  const empty=document.getElementById('pq-empty');
  if(!tbody)return;
  if(qs.length===0){tbody.innerHTML='';if(empty)empty.style.display='block';return;}
  if(empty)empty.style.display='none';
  tbody.innerHTML=qs.map(q=>`
    <tr id="pq-row-${q.id}">
      <td>${q.order}</td>
      <td id="pq-cell-${q.id}"><span id="pq-txt-${q.id}">${q.content}</span></td>
      <td><button class="btn btn-secondary btn-sm" id="pq-edit-${q.id}" onclick="togglePQEdit('${q.id}')">수정</button></td>
      <td><button class="btn btn-danger btn-sm" onclick="deletePQ('${q.id}')">삭제</button></td>
    </tr>`).join('');
}

function addPQ(){
  const qs=DB.eventPreviewQs(pvFilterEvt);
  qs.push({id:uid(),order:qs.length+1,content:'새 질문'});
  DB.saveEventPreviewQs(pvFilterEvt,qs);renderPQTable();
}

function togglePQEdit(id){
  const btn=document.getElementById('pq-edit-'+id);
  const txt=document.getElementById('pq-txt-'+id);
  const cell=document.getElementById('pq-cell-'+id);
  const existing=document.getElementById('pq-inp-'+id);
  if(btn.textContent==='저장'){
    if(!existing)return;
    const val=existing.value.trim();
    const qs=DB.eventPreviewQs(pvFilterEvt);
    const q=qs.find(x=>x.id===id);
    if(q){q.content=val;DB.saveEventPreviewQs(pvFilterEvt,qs);}
    txt.textContent=val;
    txt.style.display='';
    existing.remove();
    btn.textContent='수정';
    toast('저장되었습니다.','success');
  }else{
    txt.style.display='none';
    const inp=document.createElement('input');
    inp.className='form-input';
    inp.id='pq-inp-'+id;
    inp.value=txt.textContent;
    inp.lang='ko';
    inp.setAttribute('inputmode','text');
    inp.setAttribute('autocomplete','off');
    cell.appendChild(inp);
    btn.textContent='저장';
    requestAnimationFrame(()=>inp.focus());
  }
}

function deletePQ(id){
  confirm2('정말 삭제하시겠습니까?',()=>{
    let qs=DB.eventPreviewQs(pvFilterEvt).filter(q=>q.id!==id);
    qs.sort((a,b)=>a.order-b.order).forEach((q,i)=>q.order=i+1);
    DB.saveEventPreviewQs(pvFilterEvt,qs);renderPQTable();toast('삭제되었습니다.','success');
  });
}

function renderPQSchedTable(){
  const scheds=DB.schedules().sort((a,b)=>b.createdAt-a.createdAt);
  const tbody=document.getElementById('pq-sched-tbody');
  const empty=document.getElementById('pq-sched-empty');
  if(scheds.length===0){tbody.innerHTML='';empty.style.display='block';document.getElementById('pq-sched-pagination').innerHTML='';return;}
  empty.style.display='none';
  scheds.forEach((s,i)=>s.order=scheds.length-i);
  const start=(pqSchedPage-1)*SCHED_PER_PAGE;
  const slice=scheds.slice(start,start+SCHED_PER_PAGE);
  tbody.innerHTML=slice.map(s=>`
    <tr>
      <td>${s.order}</td>
      <td>${s.displayText}</td>
      <td style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <label class="toggle">
          <input type="checkbox" ${s.isPreviewActive?'checked':''} ${isScheduleExpired(s)?'disabled':''} onchange="togglePQSchedActive('${s.id}',this.checked)">
          <div class="toggle-track"></div>
        </label>
        ${isScheduleExpired(s)
          ?'<span style="font-size:10px;color:var(--txt3);">종료됨</span>'
          :`<button class="btn btn-secondary btn-sm" data-sid="${s.id}" onclick="applyQuestionSnapshot(this.dataset.sid)" style="font-size:11px;padding:4px 8px;">변경된 질문 적용</button>`
        }
      </td>
    </tr>`).join('');
  renderPagination('pq-sched-pagination',pqSchedPage,scheds.length,SCHED_PER_PAGE,'initAdminPQSchedPage');
}

function initAdminPQSchedPage(p){pqSchedPage=p;renderPQSchedTable();}

function togglePQSchedActive(id,val){
  const scheds=DB.schedules();
  const s=scheds.find(x=>x.id===id);
  if(s){
    if(isScheduleExpired(s)){toast('지난 일정은 변경할 수 없습니다.','error');return;}
    s.isPreviewActive=val;
    DB.saveSchedules(scheds);
  }
}

// 질문 스냅샷 적용
function applyQuestionSnapshot(id){
  confirm2('정말 변경하시겠습니까?',function(){
    const scheds=DB.schedules();
    const s=scheds.find(x=>x.id===id);
    if(s){
      if(isScheduleExpired(s)){toast('지난 일정은 변경할 수 없습니다.','error');return;}
      const evtId=s.eventId||pvFilterEvt||'evt_default';
      s.previewQuestions=DB.eventPreviewQs(evtId).sort((a,b)=>a.order-b.order)
        .map(q=>({id:q.id,order:q.order,content:q.content}));
      DB.saveSchedules(scheds);
      toast('질문이 적용되었습니다.','success');
    }
  });
}

// ═══════════════════════════════════════════════════
//  PAGE 17: ADMIN REVIEW QUESTIONS
// ═══════════════════════════════════════════════════
function initAdminRQ(){
  setupAdmin('17','admin-rq');
  renderRQTable();
  const notice=DB.reviewNotice();
  document.getElementById('rq-notice-display').textContent=notice;
  document.getElementById('rq-notice-input').value=notice;
}

function renderRQTable(){
  const qs=DB.eventReviewQs(rvFilterEvt).sort((a,b)=>a.order-b.order);
  const tbody=document.getElementById('rq-tbody');
  const empty=document.getElementById('rq-empty');
  if(!tbody)return;
  if(qs.length===0){tbody.innerHTML='';if(empty)empty.style.display='block';return;}
  if(empty)empty.style.display='none';
  tbody.innerHTML=qs.map(q=>`
    <tr>
      <td>${q.order}</td>
      <td id="rq-cell-${q.id}"><span id="rq-txt-${q.id}">${q.content}</span></td>
      <td><button class="btn btn-secondary btn-sm" id="rq-edit-${q.id}" onclick="toggleRQEdit('${q.id}')">수정</button></td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteRQ('${q.id}')">삭제</button></td>
    </tr>`).join('');
}

function addRQ(){
  const qs=DB.eventReviewQs(rvFilterEvt);
  qs.push({id:uid(),order:qs.length+1,content:'새 질문'});
  DB.saveEventReviewQs(rvFilterEvt,qs);renderRQTable();
}

function toggleRQEdit(id){
  const btn=document.getElementById('rq-edit-'+id);
  const txt=document.getElementById('rq-txt-'+id);
  const cell=document.getElementById('rq-cell-'+id);
  const existing=document.getElementById('rq-inp-'+id);
  if(btn.textContent==='저장'){
    if(!existing)return;
    const val=existing.value.trim();
    const qs=DB.eventReviewQs(rvFilterEvt);
    const q=qs.find(x=>x.id===id);
    if(q){q.content=val;DB.saveEventReviewQs(rvFilterEvt,qs);}
    txt.textContent=val;
    txt.style.display='';
    existing.remove();
    btn.textContent='수정';
    toast('저장되었습니다.','success');
  }else{
    txt.style.display='none';
    const inp=document.createElement('input');
    inp.className='form-input';
    inp.id='rq-inp-'+id;
    inp.value=txt.textContent;
    inp.lang='ko';
    inp.setAttribute('inputmode','text');
    inp.setAttribute('autocomplete','off');
    cell.appendChild(inp);
    btn.textContent='저장';
    requestAnimationFrame(()=>inp.focus());
  }
}

function deleteRQ(id){
  confirm2('정말 삭제하시겠습니까?',()=>{
    let qs=DB.eventReviewQs(rvFilterEvt).filter(q=>q.id!==id);
    qs.sort((a,b)=>a.order-b.order).forEach((q,i)=>q.order=i+1);
    DB.saveEventReviewQs(rvFilterEvt,qs);renderRQTable();toast('삭제되었습니다.','success');
  });
}

let rqNoticeEditing=false;
function toggleRQNotice(){
  const display=document.getElementById('rq-notice-display');
  const edit=document.getElementById('rq-notice-edit');
  const btn=document.getElementById('rq-notice-btn');
  if(rqNoticeEditing){
    const val=document.getElementById('rq-notice-input').value;
    DB.saveReviewNotice(val);
    display.textContent=val;
    display.style.display='';edit.style.display='none';btn.textContent='수정';
    rqNoticeEditing=false;toast('저장되었습니다.','success');
  }else{
    display.style.display='none';edit.style.display='block';btn.textContent='저장';
    rqNoticeEditing=true;
  }
}

// ── 작성방법 안내 관리 ──
function initGuideCard(prefix, key){
  const g=DB.get(key,{enabled:false,content:''});
  const enabledEl=document.getElementById(prefix+'-guide-enabled');
  const displayEl=document.getElementById(prefix+'-guide-display');
  const inputEl=document.getElementById(prefix+'-guide-input');
  if(enabledEl)enabledEl.checked=g.enabled||false;
  if(displayEl)displayEl.textContent=g.content||'(내용 없음)';
  if(inputEl)inputEl.value=g.content||'';
}

function saveGuideEnabled(key, val){
  const g=DB.get(key,{enabled:false,content:''});
  g.enabled=val;
  DB.set(key,g);
  toast(val?'사용자에게 표시됩니다.':'사용자에게 숨겨집니다.','info');
}

function toggleGuideEdit(prefix){
  const guideKey=prefix==='pv'?'previewGuide':'reviewGuide';
  const displayEl=document.getElementById(prefix+'-guide-display');
  const editEl=document.getElementById(prefix+'-guide-edit');
  const inputEl=document.getElementById(prefix+'-guide-input');
  const btn=document.getElementById(prefix+'-guide-edit-btn');
  if(btn.textContent==='저장'){
    const val=inputEl.value;
    const g=DB.get(guideKey,{enabled:false,content:''});
    g.content=val;
    DB.set(guideKey,g);
    displayEl.textContent=val||'(내용 없음)';
    displayEl.style.display='';
    editEl.style.display='none';
    btn.textContent='수정';
    toast('저장되었습니다.','success');
  } else {
    displayEl.style.display='none';
    editEl.style.display='block';
    inputEl.setAttribute('lang','ko');
    btn.textContent='저장';
    requestAnimationFrame(()=>inputEl.focus());
  }
}


// ═══════════════════════════════════════════════════
//  팝업 관리
// ═══════════════════════════════════════════════════
function initAdminPopup(){
  setupAdmin('popup','admin-popup');
  const popup=DB.get('noticePopup',{enabled:false,text:'',textEnabled:true,imageData:'',imageEnabled:true});

  const el=(id)=>document.getElementById(id);
  el('popup-enabled-toggle').checked=popup.enabled||false;
  el('popup-text-enabled').checked=popup.textEnabled!==false;
  el('popup-img-enabled').checked=popup.imageEnabled!==false;
  el('popup-text-input').value=popup.text||'';

  if(popup.imageData){
    el('popup-img-preview-img').src=popup.imageData;
    el('popup-img-preview-img').style.display='';
    el('popup-img-none-txt').style.display='none';
  } else {
    el('popup-img-preview-img').style.display='none';
    el('popup-img-none-txt').style.display='';
  }
}

function savePopupSetting(){if(_isComposing)return;
  const el=(id)=>document.getElementById(id);
  const current=DB.get('noticePopup',{enabled:false,text:'',textEnabled:true,imageData:'',imageEnabled:true});
  const updated={
    ...current,
    enabled:el('popup-enabled-toggle').checked,
    textEnabled:el('popup-text-enabled').checked,
    imageEnabled:el('popup-img-enabled').checked,
    text:el('popup-text-input').value,
    savedAt:Date.now(),
  };
  DB.set('noticePopup',updated);
}

function handlePopupImg(input){
  const file=input.files[0];
  if(!file)return;
  if(file.size>3*1024*1024){toast('이미지는 3MB 이하만 가능합니다.','error');return;}
  const reader=new FileReader();
  reader.onload=e=>{
    const data=e.target.result;
    const el=(id)=>document.getElementById(id);
    el('popup-img-preview-img').src=data;
    el('popup-img-preview-img').style.display='';
    el('popup-img-none-txt').style.display='none';
    const current=DB.get('noticePopup',{enabled:false,text:'',textEnabled:true,imageData:'',imageEnabled:true});
    DB.set('noticePopup',{...current,imageData:data,savedAt:Date.now()});
    toast('사진이 등록되었습니다.','success');
  };
  reader.readAsDataURL(file);
}

function resetPopupHide(){
  localStorage.removeItem('sjt_popupHideDate');
  toast('숨김이 초기화되었습니다. 일반 사용자 페이지에서 팝업이 다시 표시됩니다.','success');
}

function removePopupImg(){
  confirm2('사진을 삭제하시겠습니까?',()=>{
    const el=(id)=>document.getElementById(id);
    el('popup-img-preview-img').src='';
    el('popup-img-preview-img').style.display='none';
    el('popup-img-none-txt').style.display='';
    const current=DB.get('noticePopup',{enabled:false,text:'',textEnabled:true,imageData:'',imageEnabled:true});
    DB.set('noticePopup',{...current,imageData:'',savedAt:Date.now()});
    toast('사진이 삭제되었습니다.','success');
  });
}

function previewPopup(){
  const el=(id)=>document.getElementById(id);
  const text=el('popup-text-input').value;
  const textEnabled=el('popup-text-enabled').checked;
  const imgSrc=el('popup-img-preview-img').src;
  const imgEnabled=el('popup-img-enabled').checked;

  if(!text&&!imgSrc){toast('글 또는 사진을 먼저 등록해주세요.','error');return;}

  // 미리보기 팝업 생성
  const old=document.getElementById('admin-preview-popup');
  if(old)old.remove();

  const showText=textEnabled&&text;
  const showImg=imgEnabled&&imgSrc&&!imgSrc.endsWith('admin.html');

  const overlay=document.createElement('div');
  overlay.id='admin-preview-popup';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML=`
    <div style="background:#1a1a2e;border:1px solid rgba(255,255,255,.15);border-radius:10px;width:min(700px,96vw);max-height:90vh;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.8);display:flex;flex-direction:column;">
      <div style="background:#0f0f1c;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.1);">
        <div style="display:flex;gap:7px;"><div style="width:12px;height:12px;border-radius:50%;background:#ff5f57;"></div><div style="width:12px;height:12px;border-radius:50%;background:#febc2e;"></div><div style="width:12px;height:12px;border-radius:50%;background:#28c840;"></div></div>
        <div style="font-size:12px;color:rgba(255,255,255,.4);">공지사항 (미리보기)</div>
        <button onclick="document.getElementById('admin-preview-popup').remove()" style="background:none;border:none;color:rgba(255,255,255,.4);cursor:pointer;font-size:16px;">✕</button>
      </div>
      <div style="display:flex;flex:1;overflow:hidden;min-height:260px;">
        ${showImg?`<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:16px;overflow:hidden;${showText?'border-right:1px solid rgba(255,255,255,.08);':''}"><img src="${imgSrc}" style="max-width:100%;max-height:260px;border-radius:8px;object-fit:contain;" alt=""></div>`:''}
        ${showText?`<div style="flex:1;padding:20px;overflow-y:auto;font-size:14px;color:#f0f0f8;line-height:1.75;white-space:pre-line;">${text}</div>`:''}
      </div>
      <div style="padding:10px 16px;border-top:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:space-between;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:rgba(255,255,255,.45);">
          <input type="checkbox" style="accent-color:#c9a96e;width:14px;height:14px;"> 오늘 하루 그만보기
        </label>
        <button onclick="document.getElementById('admin-preview-popup').remove()" style="background:rgba(201,169,110,.15);border:1px solid #c9a96e;color:#c9a96e;padding:6px 18px;border-radius:6px;font-size:13px;cursor:pointer;">닫기</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}


// ═══════════════════════════════════════════════════
//  PAGE 18: ADMIN FAQ
// ═══════════════════════════════════════════════════
function initAdminFAQ(){
  setupAdmin('18','admin-faq');
  renderFAQAdmin();
}

function renderFAQAdmin(){
  const faqs=DB.faq().sort((a,b)=>a.order-b.order);
  const el=document.getElementById('faq-admin-list');
  const empty=document.getElementById('faq-admin-empty');
  if(faqs.length===0){el.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  el.innerHTML=faqs.map(f=>`
    <div class="card" style="margin-bottom:10px;" id="faq-card-${f.id}">
      <div class="flex-between mb8">
        <div style="font-size:13px;font-weight:600;color:var(--txt2);">Q${f.order}.</div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-secondary btn-sm" id="faq-edit-${f.id}" onclick="toggleFAQEdit('${f.id}')">수정</button>
          <button class="btn btn-danger btn-sm" onclick="deleteFAQItem('${f.id}')">삭제</button>
        </div>
      </div>
      <div id="faq-disp-q-${f.id}" style="font-size:14px;font-weight:500;color:var(--txt);margin-bottom:8px;">${f.question}</div>
      <div id="faq-disp-a-${f.id}" style="font-size:13px;color:var(--txt2);">${f.answer||'(답변 없음)'}</div>
      <div id="faq-edit-area-${f.id}" style="display:none;">
        <div class="form-group mt8"><label class="form-label">질문</label><input class="form-input" id="faq-inp-q-${f.id}" value="${f.question}"></div>
        <div class="form-group"><label class="form-label">답변</label><textarea class="form-textarea" id="faq-inp-a-${f.id}">${f.answer}</textarea></div>
      </div>
    </div>`).join('');
}

function addFAQ(){
  const faqs=DB.faq();
  faqs.push({id:uid(),order:faqs.length+1,question:'새 질문',answer:''});
  DB.saveFaq(faqs);renderFAQAdmin();
}

function toggleFAQEdit(id){
  const btn=document.getElementById('faq-edit-'+id);
  const dispQ=document.getElementById('faq-disp-q-'+id);
  const dispA=document.getElementById('faq-disp-a-'+id);
  const editArea=document.getElementById('faq-edit-area-'+id);
  if(btn.textContent==='저장'){
    const faqs=DB.faq();
    const f=faqs.find(x=>x.id===id);
    if(f){
      f.question=document.getElementById('faq-inp-q-'+id).value.trim();
      f.answer=document.getElementById('faq-inp-a-'+id).value.trim();
      DB.saveFaq(faqs);
    }
    dispQ.textContent=f.question;
    dispA.textContent=f.answer||'(답변 없음)';
    dispQ.style.display='';dispA.style.display='';editArea.style.display='none';btn.textContent='수정';
    toast('저장되었습니다.','success');
  }else{
    dispQ.style.display='none';dispA.style.display='none';editArea.style.display='block';btn.textContent='저장';
    requestAnimationFrame(()=>{
      const qInp=document.getElementById('faq-inp-q-'+id);
      if(qInp){
        qInp.lang='ko';
        qInp.setAttribute('inputmode','text');
        qInp.setAttribute('autocomplete','off');
        qInp.focus();
      }
    });
  }
}

function deleteFAQItem(id){
  confirm2('정말 삭제하시겠습니까?',()=>{
    let faqs=DB.faq().filter(f=>f.id!==id);
    faqs.sort((a,b)=>a.order-b.order).forEach((f,i)=>f.order=i+1);
    DB.saveFaq(faqs);renderFAQAdmin();toast('삭제되었습니다.','success');
  });
}


// ═══════════════════════════════════════════════════
//  ADMIN MAIN MANAGE (메인 관리)
// ═══════════════════════════════════════════════════
function initAdminMainManage(){
  setupAdmin('mm','admin-main-manage');
  renderSocialLinksSection();
  renderMMGrid();
}

// ── 소셜 링크 관리 ──
function renderSocialLinksSection(){
  const area=document.getElementById('mm-social-links-area');
  if(!area)return;
  const links=DB.socialLinks();
  let html='';
  if(links.length===0){
    html='<div style="font-size:13px;color:var(--txt3);padding:8px 0;">등록된 링크가 없습니다.</div>';
  } else {
    links.forEach((lk,i)=>{
      html+=`<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--bd);">
        <div style="flex:0 0 90px;font-size:13px;font-weight:600;color:var(--txt);">${lk.name}</div>
        <div style="flex:1;font-size:12px;color:var(--txt3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${lk.url||'(URL 없음)'}</div>
        <button class="btn btn-secondary btn-sm" onclick="editSocialLink(${i})">수정</button>
        <button class="btn btn-danger btn-sm" onclick="removeSocialLink(${i})">삭제</button>
      </div>
      <div id="sl-edit-area-${i}" style="display:none;padding:8px 0;gap:8px;flex-direction:column;">
        <input class="form-input" id="sl-edit-name-${i}" value="${lk.name}" placeholder="플랫폼 이름 (예: Instagram)" lang="ko" inputmode="text" style="margin-bottom:6px;">
        <div style="display:flex;gap:8px;">
          <input class="form-input" id="sl-edit-url-${i}" value="${lk.url||''}" placeholder="https://..." inputmode="url" style="flex:1;">
          <button class="btn btn-primary btn-sm" onclick="saveSocialLink(${i})">저장</button>
        </div>
      </div>`;
    });
  }
  area.innerHTML=html;
}

function editSocialLink(i){
  const area=document.getElementById('sl-edit-area-'+i);
  if(!area)return;
  const isOpen=area.style.display==='flex';
  document.querySelectorAll('[id^="sl-edit-area-"]').forEach(el=>el.style.display='none');
  if(!isOpen)area.style.display='flex';
}

function saveSocialLink(i){
  const links=DB.socialLinks();
  const name=(document.getElementById('sl-edit-name-'+i)?.value||'').trim();
  const url=(document.getElementById('sl-edit-url-'+i)?.value||'').trim();
  if(!name){toast('플랫폼 이름을 입력해주세요.','error');return;}
  links[i]={...links[i],name,url};
  DB.saveSocialLinks(links);
  toast('저장되었습니다.','success');
  renderSocialLinksSection();
}

function removeSocialLink(i){
  if(!confirm('이 링크를 삭제하시겠습니까?'))return;
  const links=DB.socialLinks();
  links.splice(i,1);
  DB.saveSocialLinks(links);
  toast('삭제되었습니다.','success');
  renderSocialLinksSection();
}

function addSocialLink(){
  const name=(document.getElementById('sl-new-name')?.value||'').trim();
  const url=(document.getElementById('sl-new-url')?.value||'').trim();
  if(!name){toast('플랫폼 이름을 입력해주세요.','error');return;}
  const links=DB.socialLinks();
  links.push({id:'sl_'+Date.now(),name,url});
  DB.saveSocialLinks(links);
  document.getElementById('sl-new-name').value='';
  document.getElementById('sl-new-url').value='';
  toast('추가되었습니다.','success');
  renderSocialLinksSection();
}

function initGenderTextCard(){
  const text=DB.genderSubText();
  const display=document.getElementById('gender-text-display');
  const input=document.getElementById('gender-text-input');
  if(display)display.textContent=text||'(입력된 텍스트 없음)';
  if(input)input.value=text;
}

function toggleGenderTextEdit(){
  const editArea=document.getElementById('gender-text-edit');
  const btn=document.getElementById('gender-text-edit-btn');
  const isEditing=editArea.style.display!=='none';
  if(isEditing){
    const text=document.getElementById('gender-text-input').value;
    DB.saveGenderSubText(text);
    document.getElementById('gender-text-display').textContent=text||'(입력된 텍스트 없음)';
    editArea.style.display='none';
    btn.textContent='수정';
    toast('저장되었습니다.','success');
  } else {
    editArea.style.display='block';
    btn.textContent='저장';
  }
}

function renderMMGrid(){
  const DEFAULT_DEFS=[
    {id:'apply',label:'신청하기',icon:'📋',bg:''},
    {id:'order',label:'칵테일 주문',icon:'🍹',bg:''},
    {id:'matching',label:'매칭 결과',icon:'💑',bg:''},
    {id:'pv-view',label:'자기소개서 모음',icon:'👀',bg:''},
    {id:'rv-view',label:'상작팅 후기',icon:'💬',bg:''},
    {id:'faq',label:'Q&A',icon:'❓',bg:''},
  ];
  const saved=DB.get('mainMenuDefs',null);
  const menuDefs=DEFAULT_DEFS.map(d=>{
    const s=saved?saved.find(x=>x.id===d.id):null;
    return s?{...d,label:s.label||d.label,bg:s.bg||''}:d;
  });
  DB.set('mainMenuDefs',menuDefs);
  const grid=document.getElementById('mm-menu-grid');
  if(!grid)return;
  let html='';
  menuDefs.forEach(function(m){
    const bgStyle=m.bg?('background:url('+m.bg+') center/cover;'):'background:var(--bg4);';
    const iconHtml=m.bg?'':'<span>'+m.icon+'</span>';
    html+='<div class="card" style="margin-bottom:0;">'
      +'<div style="'+bgStyle+'border-radius:var(--r2);aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:10px;border:1px solid var(--bd);overflow:hidden;">'+iconHtml+'</div>'
      +'<div id="mm-label-'+m.id+'" style="font-size:13px;color:var(--txt);text-align:center;margin-bottom:8px;">'+m.label+'</div>'
      +'<div style="display:flex;gap:6px;">'
      +'<button class="btn btn-secondary btn-sm" style="flex:1;" id="mm-edit-btn-'+m.id+'" onclick="toggleMMEdit(&quot;'+m.id+'&quot;)">글 수정</button>'
      +(m.bg
        ?'<button class="btn btn-danger btn-sm" style="flex:1;" onclick="removeMMBg(&quot;'+m.id+'&quot;)">배경 삭제</button>'
        :'<button class="btn btn-secondary btn-sm" style="flex:1;" onclick="openMMBgPicker(&quot;'+m.id+'&quot;)">배경사진</button>'
      )
      +'<input type="file" id="mm-file-'+m.id+'" accept="image/*" style="display:none;" onchange="handleMMBg(&quot;'+m.id+'&quot;,this)">'
      +'</div>'
      +'<div id="mm-edit-area-'+m.id+'"></div>'
      +'</div>';
  });
  grid.innerHTML=html;
}

function toggleMMEdit(id){
  const area=document.getElementById('mm-edit-area-'+id);
  const btn=document.getElementById('mm-edit-btn-'+id);
  if(area.querySelector('input')){
    area.innerHTML='';
    area.style.marginTop='0';
    btn.textContent='글 수정';
    return;
  }
  const defs=DB.get('mainMenuDefs',[]);
  const m=defs.find(x=>x.id===id);
  const currentLabel=m?m.label:'';
  const inp=document.createElement('input');
  inp.type='text';
  inp.className='form-input';
  inp.id='mm-inp-'+id;
  inp.lang='ko';
  inp.setAttribute('inputmode','text');
  inp.setAttribute('autocomplete','off');
  inp.value=currentLabel;
  inp.style.marginBottom='6px';
  const saveBtn=document.createElement('button');
  saveBtn.className='btn btn-primary btn-sm btn-full';
  saveBtn.textContent='저장';
  saveBtn.onclick=function(){saveMMLabel(id);};
  area.appendChild(inp);
  area.appendChild(saveBtn);
  area.style.marginTop='8px';
  btn.textContent='닫기';
}

function saveMMLabel(id){
  const inp=document.getElementById('mm-inp-'+id);
  const val=inp?inp.value.trim():'';
  if(!val)return;
  const defs=DB.get('mainMenuDefs',[]);
  const m=defs.find(x=>x.id===id);
  if(m){m.label=val;DB.set('mainMenuDefs',defs);}
  document.getElementById('mm-label-'+id).textContent=val;
  toggleMMEdit(id);
  toast('저장되었습니다.','success');
}

function openMMBgPicker(id){
  document.getElementById('mm-file-'+id).click();
}

function removeMMBg(id){
  confirm2('배경사진을 삭제하시겠습니까?',function(){
    const defs=DB.get('mainMenuDefs',[]);
    const m=defs.find(x=>x.id===id);
    if(m){m.bg='';DB.set('mainMenuDefs',defs);}
    renderMMGrid();
    toast('배경사진이 삭제되었습니다.','success');
  });
}

function handleMMBg(id, input){
  const file=input.files[0];
  if(!file)return;
  if(file.size>2*1024*1024){toast('이미지는 2MB 이하만 가능합니다.','error');return;}
  const reader=new FileReader();
  reader.onload=e=>{
    const defs=DB.get('mainMenuDefs',[]);
    const m=defs.find(x=>x.id===id);
    if(m){m.bg=e.target.result;DB.set('mainMenuDefs',defs);}
    renderMMGrid();
    toast('배경사진이 등록되었습니다.','success');
  };
  reader.readAsDataURL(file);
}

// ═══════════════════════════════════════════════════
//  ADMIN APPLICANTS (standalone with schedule selector + excel)
// ═══════════════════════════════════════════════════
let appFilterEvt='all';
let _appPollTimer=null;

async function refreshApplicantsFromSB(){
  const btn=document.getElementById('app-refresh-btn');
  if(btn){btn.disabled=true;btn.textContent='로딩 중...';}
  await loadFromSB();
  renderAppEventTabs();
  buildAppScheduleMenu();
  if(currentSchedId)renderApplicants();
  if(btn){btn.disabled=false;btn.textContent='🔄 새로고침';}
  toast('최신 데이터를 불러왔습니다.','success');
}

function appStartPolling(){
  if(_appPollTimer)clearInterval(_appPollTimer);
  _appPollTimer=setInterval(async()=>{
    if(currentPage!=='admin-applicants'){appStopPolling();return;}
    if(!_sb)return;
    try{
      const{data}=await _sb.from('app_data').select('key,value').like('key','app_%');
      if(!data)return;
      const apps=[];
      data.forEach(row=>{try{apps.push({...JSON.parse(row.value),fileData:''});}catch(e){} });
      const current=JSON.parse(localStorage.getItem('sjt_applications')||'[]');
      const changed=apps.length!==current.length||apps.some(a=>!current.find(c=>c.id===a.id));
      if(changed){
        localStorage.setItem('sjt_applications',JSON.stringify(apps));
        renderApplicants();
      }
    }catch(e){}
  },15000);
}

function appStopPolling(){
  if(_appPollTimer){clearInterval(_appPollTimer);_appPollTimer=null;}
}

async function initAdminApplicants(scheduleId){
  setupAdmin('11','admin-applicants');
  appStartPolling();
  renderAppEventTabs();
  buildAppScheduleMenu();
  if(scheduleId){
    currentSchedId=scheduleId;
    const sched=DB.schedules().find(s=>s.id===scheduleId);
    const valEl=document.getElementById('app-schedule-val');
    if(valEl&&sched)valEl.textContent=sched.displayText;
    const btn=document.getElementById('manual-entry-btn');
    if(btn){btn.style.display='';btn.disabled=true;}
    const loadEl=document.getElementById('applicants-content');
    if(loadEl)loadEl.innerHTML='<div class="empty-state" style="padding:16px;">불러오는 중...</div>';
    await syncScheduleApplications(scheduleId);
    if(btn)btn.disabled=false;
    renderApplicants();
  } else {
    document.getElementById('applicants-content').innerHTML='';
    const valEl=document.getElementById('app-schedule-val');
    if(valEl)valEl.textContent='일정을 선택해주세요.';
  }
}

function renderAppEventTabs(){
  const events=DB.events();
  const el=document.getElementById('app-event-tabs');
  if(!el)return;
  const all=[{id:'all',name:'전체'},...events];
  el.innerHTML=all.map(e=>`<button class="btn btn-sm ${appFilterEvt===e.id?'btn-primary':'btn-secondary'}" onclick="setAppFilterEvt('${e.id}')">${e.name}</button>`).join('');
}

function setAppFilterEvt(evtId){
  appFilterEvt=evtId;
  currentSchedId=null;
  renderAppEventTabs();
  buildAppScheduleMenu();
  document.getElementById('applicants-content').innerHTML='';
  const valEl=document.getElementById('app-schedule-val');
  if(valEl)valEl.textContent='일정을 선택해주세요.';
}

function buildAppScheduleMenu(){
  let scheds=DB.schedules().sort((a,b)=>b.createdAt-a.createdAt);
  if(appFilterEvt!=='all')scheds=scheds.filter(s=>s.eventId===appFilterEvt);
  const menu=document.getElementById('app-schedule-menu');
  if(!menu)return;
  if(scheds.length===0){menu.innerHTML='<div class="dropdown-empty">등록된 일정이 없습니다.</div>';}
  else{
    const events=DB.events();
    menu.innerHTML=scheds.map(s=>{
      const evt=events.find(e=>e.id===s.eventId);
      const label=evt?`[${evt.name}] ${s.displayText}`:s.displayText;
      return `<div class="dropdown-item" onclick="selectAppSchedule('${s.id}','${s.displayText}')">${label}</div>`;
    }).join('');
  }
}

async function selectAppSchedule(id, text){
  currentSchedId=id;
  const valEl=document.getElementById('app-schedule-val');
  if(valEl)valEl.textContent=text;
  document.getElementById('app-schedule-btn').classList.remove('open');
  document.getElementById('app-schedule-menu').classList.remove('open');
  const meBtn=document.getElementById('manual-entry-btn');
  if(meBtn)meBtn.disabled=true;
  const el=document.getElementById('applicants-content');
  if(el)el.innerHTML='<div class="empty-state" style="padding:16px;">불러오는 중...</div>';
  await syncScheduleApplications(id);
  if(meBtn)meBtn.disabled=false;
  renderApplicants();
}

function downloadApplicantsExcel(){
  const apps=DB.applications();
  const scheds=DB.schedules();
  const events=DB.events();
  if(apps.length===0){toast('다운로드할 데이터가 없습니다.','error');return;}
  const header=['이벤트','일정','성별','번호','이름','생년월일','직업','전화번호','신청일시'];
  const rows=[header];
  apps.forEach(function(a){
    const sched=scheds.find(function(s){return s.id===a.scheduleId;});
    const schedText=sched?sched.displayText:'알 수 없음';
    const evt=sched?events.find(function(e){return e.id===sched.eventId;}):null;
    const evtName=evt?evt.name:'미지정';
    const dt=new Date(a.submittedAt);
    const dtStr=dt.getFullYear()+'.'
      +String(dt.getMonth()+1).padStart(2,'0')+'.'
      +String(dt.getDate()).padStart(2,'0')+' '
      +String(dt.getHours()).padStart(2,'0')+':'
      +String(dt.getMinutes()).padStart(2,'0');
    rows.push([evtName,schedText,a.gender+'자',String(a.number)+'번',a.name,a.birthdate,a.occupation,a.phone,dtStr]);
  });
  const csvRows=rows.map(function(r){
    return r.map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(',');
  });
  const csvStr=csvRows.join('\r\n');
  const bom='\uFEFF';
  const blob=new Blob([bom+csvStr],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='신청자현황_'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('엑셀 파일이 다운로드되었습니다.','success');
}

// ═══════════════════════════════════════════════════
//  칵테일 주문 관리 (ADMIN ORDER)
// ═══════════════════════════════════════════════════
const AORD_SEAT_POSITIONS={
  1:{x:19,y:25},  2:{x:19,y:33},  3:{x:19,y:42},  4:{x:19,y:50},
  5:{x:19,y:58},  6:{x:19,y:66},  7:{x:19,y:74},
  11:{x:39,y:25}, 12:{x:39,y:33}, 13:{x:39,y:42}, 14:{x:39,y:50},
  15:{x:39,y:58}, 16:{x:39,y:66}, 17:{x:39,y:74},
  21:{x:67,y:25}, 22:{x:67,y:33}, 23:{x:67,y:41}, 24:{x:67,y:49},
  25:{x:67,y:57}, 26:{x:67,y:65}, 27:{x:67,y:73},
  28:{x:57,y:73},
  31:{x:87,y:25}, 32:{x:87,y:33}, 33:{x:87,y:41}, 34:{x:87,y:49},
  35:{x:87,y:57}, 36:{x:87,y:65}, 37:{x:87,y:73},
  38:{x:87,y:81},
  41:{x:29,y:19}, 42:{x:29,y:81},
  43:{x:56,y:87}, 44:{x:67,y:87}, 45:{x:78,y:87}
};
const AORD_MENU_DEFAULTS=[
  {id:'kalvados',     name:'깔바도르',        desc:'', abv:'', category:'HIGH'},
  {id:'gimmade',      name:'깁마더',          desc:'', abv:'', category:'HIGH'},
  {id:'blackwatch',   name:'블랙와치',        desc:'', abv:'', category:'HIGH'},
  {id:'white_russian',name:'화이트 러시안',   desc:'', abv:'', category:'HIGH'},
  {id:'suntory',      name:'산토리 하이볼',   desc:'', abv:'', category:'MID'},
  {id:'gin_tonic',    name:'진토닉',          desc:'', abv:'', category:'MID'},
  {id:'kahlua',       name:'깔루아 밀크',     desc:'', abv:'', category:'MID'},
  {id:'cassis',       name:'카시스오렌지',    desc:'', abv:'', category:'MID'},
  {id:'sunset',       name:'선셋에이드',      desc:'', abv:'', category:'NON'},
  {id:'americano',    name:'아이스아메리카노',desc:'', abv:'', category:'NON'},
];
const AORD_CATS=[
  {key:'HIGH',label:'HIGH',      color:'#e07070'},
  {key:'MID', label:'MIDDLE~LOW',color:'#c9a96e'},
  {key:'NON', label:'NON-ALCOL', color:'#52c98a'},
];
let aordActiveMenu=[];
let aordMenuDirty=false;
let _aordRealtimeCh=null;

function aordGetActiveSeats(){
  const saved=DB.orderActiveSeats();
  return saved!==null?saved:Object.keys(AORD_SEAT_POSITIONS).map(Number);
}
function aordSeatGlassCount(seatNum){
  return DB.orderOrders().filter(o=>o.seatNumber===seatNum).reduce((s,o)=>s+o.items.length,0);
}
function aordEsc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function aordInitMenu(){
  const saved=DB.orderMenu();
  aordActiveMenu=(saved&&saved.length)?saved:AORD_MENU_DEFAULTS.map(m=>({...m}));
}

let _aordPollTimer=null;

async function initAdminOrder(){
  setupAdmin('admin-order','admin-order');
  aordInitMenu();
  aordSwitchTab('orders');
  aordLoadSettings();
  // Supabase에서 최신 데이터 먼저 가져온 후 렌더
  await aordSyncAndRender();
  aordStartRealtime();
  aordStartPolling();
}

async function aordSyncAndRender(){
  if(_sb){
    try{
      const{data}=await _sb.from('app_data').select('key,value').in('key',['orders','order_active_seats']);
      if(data){
        data.forEach(row=>localStorage.setItem('sjt_'+row.key, row.value));
      }
    }catch(e){}
  }
  aordRenderOrders();
  aordRenderSeats();
}

function aordStartPolling(){
  if(_aordPollTimer)clearInterval(_aordPollTimer);
  _aordPollTimer=setInterval(async()=>{
    if(currentPage!=='admin-order'){aordStopPolling();return;}
    const before=localStorage.getItem('sjt_orders');
    if(_sb){
      try{
        const{data}=await _sb.from('app_data').select('key,value').in('key',['orders','order_active_seats']);
        if(data){
          let changed=false;
          data.forEach(row=>{
            if(localStorage.getItem('sjt_'+row.key)!==row.value){changed=true;}
            localStorage.setItem('sjt_'+row.key, row.value);
          });
          if(changed){
            aordRenderOrders(); aordRenderSeats();
            const after=localStorage.getItem('sjt_orders');
            // 새 pending 주문이 생겼으면 알림
            if(before!==after){
              try{
                const prevOrders=JSON.parse(before||'[]');
                const newOrders=JSON.parse(after||'[]');
                const newPending=newOrders.filter(o=>o.status==='pending'&&!prevOrders.find(p=>p.id===o.id));
                if(newPending.length)aordShowNoti();
              }catch(e){}
            }
          }
        }
      }catch(e){}
    }
  }, 5000);
}

function aordStopPolling(){
  if(_aordPollTimer){clearInterval(_aordPollTimer);_aordPollTimer=null;}
}

function aordSwitchTab(tab){
  ['orders','menu','settings'].forEach(t=>{
    const pane=document.getElementById('aord-pane-'+t); if(pane)pane.style.display=t===tab?'':'none';
    const btn=document.getElementById('aord-tb-'+t);
    if(btn){btn.className=t===tab?'btn btn-primary btn-sm':'btn btn-secondary btn-sm';}
  });
  if(tab==='menu')aordRenderMenu();
  if(tab==='settings')aordLoadSettings();
}

// ── Realtime 구독 ──
function aordStartRealtime(){
  if(!_sb)return;
  if(_aordRealtimeCh){_sb.removeChannel(_aordRealtimeCh);_aordRealtimeCh=null;}
  _aordRealtimeCh=_sb.channel('aord-orders')
    .on('postgres_changes',{event:'*',schema:'public',table:'app_data',filter:'key=eq.orders'},payload=>{
      try{
        const newOrders=JSON.parse(payload.new.value||'[]');
        localStorage.setItem('sjt_orders',JSON.stringify(newOrders));
        aordRenderOrders();
        aordRenderSeats();
        aordShowNoti();
      }catch(e){}
    })
    .subscribe();
}
function aordShowNoti(){
  let el=document.getElementById('aord-noti');
  if(!el){
    el=document.createElement('div');
    el.id='aord-noti';
    el.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--gold);color:#000;padding:12px 28px;border-radius:var(--r2);font-size:14px;font-weight:700;z-index:1000;box-shadow:0 4px 24px rgba(0,0,0,.6);white-space:nowrap;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.textContent='🔔 새로운 주문이 들어왔습니다';
  el.style.display='block';
  clearTimeout(el._t);
  el._t=setTimeout(()=>el.style.display='none',4000);
}

// ── 주문 목록 ──
function aordRenderOrders(){
  const el=document.getElementById('aord-order-list'); if(!el)return;
  const all=DB.orderOrders();
  if(!all.length){el.innerHTML='<div class="empty-state">주문 없음</div>';return;}
  const sort=(a,b)=>a.orderedAt-b.orderedAt;
  const pending=all.filter(o=>o.status==='pending').sort(sort);
  const served=all.filter(o=>o.status==='served').sort(sort);
  let html='';
  if(pending.length){
    html+=`<div style="font-size:12px;font-weight:600;color:var(--gold);margin-bottom:8px;">⏳ 대기 중 (${pending.length}건)</div>`;
    html+=pending.map(o=>aordOrderCard(o)).join('');
  }
  if(served.length){
    html+=`<div style="font-size:12px;font-weight:600;color:var(--txt3);margin-top:16px;margin-bottom:8px;">✓ 서빙 완료 (${served.length}건)</div>`;
    html+=served.map(o=>aordOrderCard(o,true)).join('');
  }
  el.innerHTML=html;
}
function aordOrderCard(o,done=false){
  const names=o.items.map(id=>aordActiveMenu.find(m=>m.id===id)?.name).filter(Boolean).join(', ');
  const t=new Date(o.orderedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
  const total=aordSeatGlassCount(o.seatNumber), maxG=DB.orderMaxGlasses(), full=total>=maxG;
  return `<div style="background:var(--bg4);border:1px solid var(--bd2);border-radius:var(--r2);padding:12px;margin-bottom:8px;${done?'opacity:.45':''}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <span style="font-size:13px;font-weight:600;color:var(--txt);">
        ${o.gender}자 ${o.datingNumber}번
        <span style="color:var(--txt3);font-weight:400;"> 좌석 ${o.seatNumber}번</span>
        <span style="font-size:11px;color:${full?'var(--err)':'var(--txt3)'};">&nbsp;(${total}/${maxG}잔)</span>
      </span>
      <span style="font-size:11px;color:var(--txt3);">${t}</span>
    </div>
    <div style="font-size:13px;color:var(--gold);margin-bottom:10px;">${names}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;">
      ${!done
        ?`<button class="btn btn-success btn-sm" onclick="aordServe('${o.id}')">✓ 서빙 완료</button>
          <button class="btn btn-danger btn-sm" onclick="aordClearSeat(${o.seatNumber})">좌석 초기화</button>`
        :'<span style="font-size:11px;color:var(--txt3);">서빙 완료됨</span>'}
    </div>
  </div>`;
}
function aordServe(id){
  const orders=DB.orderOrders(), o=orders.find(x=>x.id===id); if(!o)return;
  o.status='served'; DB.saveOrderOrders(orders); aordRenderOrders();
  toast(`${o.gender}자 ${o.datingNumber}번 서빙 완료`,'success');
}
function aordClearSeat(seatNum){
  DB.saveOrderOrders(DB.orderOrders().filter(o=>o.seatNumber!==seatNum));
  // 해당 좌석 다시 활성화
  const seats=aordGetActiveSeats();
  if(!seats.includes(seatNum)){seats.push(seatNum); DB.saveOrderActiveSeats(seats);}
  aordRenderOrders(); aordRenderSeats();
  toast(`좌석 ${seatNum}번 초기화`,'success');
}
function aordClearAll(){
  if(!confirm('전체 주문을 초기화하시겠습니까?\n모든 좌석이 다시 활성화됩니다.'))return;
  DB.saveOrderOrders([]);
  DB.saveOrderActiveSeats(Object.keys(AORD_SEAT_POSITIONS).map(Number));
  aordRenderOrders(); aordRenderSeats();
  toast('전체 주문 초기화 완료','success');
}

// ── 좌석 오버레이 ──
function aordRenderSeats(){
  const active=aordGetActiveSeats(), ol=document.getElementById('aord-seat-ol'); if(!ol)return;
  ol.innerHTML=Object.entries(AORD_SEAT_POSITIONS).map(([id,p])=>{
    const n=parseInt(id), on=active.includes(n);
    return `<button onclick="aordToggleSeat(${n})" title="${on?n+'번 비활성화':n+'번 활성화'}"
      style="position:absolute;left:${p.x}%;top:${p.y}%;transform:translate(-50%,-50%);
      width:28px;height:28px;border-radius:50%;padding:0;font-family:inherit;cursor:pointer;
      border:${on?'2px solid rgba(201,169,110,.8)':'2px solid #0c0b16'};
      background:${on?'rgba(201,169,110,.12)':'#0c0b16'};"></button>`;
  }).join('');
}
function aordToggleSeat(n){
  const seats=aordGetActiveSeats(), i=seats.indexOf(n);
  if(i>=0)seats.splice(i,1); else seats.push(n);
  DB.saveOrderActiveSeats(seats); aordRenderSeats();
}

// ── 메뉴관리 ──
function aordSetDirty(dirty){
  aordMenuDirty=dirty;
  const btn=document.getElementById('aord-menu-save-btn'); if(!btn)return;
  if(dirty){btn.textContent='저장 *';btn.className='btn btn-primary btn-sm';}
  else{btn.textContent='저장';btn.className='btn btn-secondary btn-sm';}
}
function aordSaveMenu(){DB.saveOrderMenu(aordActiveMenu);aordSetDirty(false);toast('메뉴가 저장되었습니다.','success');}
function aordResetMenu(){
  if(aordMenuDirty&&!confirm('저장하지 않은 변경사항이 있습니다. 되돌리시겠습니까?'))return;
  aordInitMenu();aordSetDirty(false);aordRenderMenu();toast('변경사항을 되돌렸습니다.','info');
}
function aordRenderMenu(){
  const list=document.getElementById('aord-menu-list'); if(!list)return;
  if(!aordActiveMenu.length){list.innerHTML='<div class="empty-state">메뉴 없음</div>';return;}
  list.innerHTML=aordActiveMenu.map((m,i)=>`
    <div style="padding:12px 0;${i<aordActiveMenu.length-1?'border-bottom:1px solid var(--bd);':''}">
      <div style="display:flex;gap:6px;margin-bottom:6px;">
        <input class="form-input" value="${aordEsc(m.name)}" placeholder="메뉴명 *"
          oninput="aordUpdateItem(${i},'name',this.value)" style="flex:1;">
        <input class="form-input" value="${aordEsc(m.abv)}" placeholder="도수"
          oninput="aordUpdateItem(${i},'abv',this.value)" style="width:80px;">
        <button onclick="aordDelItem(${i})" class="btn btn-danger btn-sm">✕</button>
      </div>
      <div style="margin-bottom:6px;">
        <select class="form-select" onchange="aordUpdateItem(${i},'category',this.value)">
          <option value="HIGH" ${(m.category||'MID')==='HIGH'?'selected':''}>HIGH</option>
          <option value="MID"  ${(m.category||'MID')==='MID' ?'selected':''}>MIDDLE~LOW</option>
          <option value="NON"  ${(m.category||'MID')==='NON' ?'selected':''}>NON-ALCOL</option>
        </select>
      </div>
      <input class="form-input" value="${aordEsc(m.desc)}" placeholder="설명 (선택)"
        oninput="aordUpdateItem(${i},'desc',this.value)">
    </div>
  `).join('');
}
function aordUpdateItem(i,field,value){aordActiveMenu[i][field]=value;aordSetDirty(true);}
function aordAddMenuItem(){
  aordActiveMenu.push({id:'item_'+Date.now(),name:'',desc:'',abv:'',category:'MID'});
  aordSetDirty(true);aordRenderMenu();
}
function aordDelItem(i){
  if(!confirm(`"${aordActiveMenu[i].name||'이 메뉴'}"를 삭제하시겠습니까?`))return;
  aordActiveMenu.splice(i,1);aordSetDirty(true);aordRenderMenu();
}

// ── 설정 ──
function aordLoadSettings(){
  const mode=DB.orderLimitMode();
  const numRadio=document.getElementById('aord-mode-num');
  const seatRadio=document.getElementById('aord-mode-seat');
  if(numRadio)numRadio.checked=(mode==='num');
  if(seatRadio)seatRadio.checked=(mode==='seat');
  aordApplyLimitModeUI(mode);
  const mgEl=document.getElementById('aord-max-glasses-display'); if(mgEl)mgEl.textContent=DB.orderMaxGlasses();
  const mgNumEl=document.getElementById('aord-max-glasses-per-num-display'); if(mgNumEl)mgNumEl.textContent=DB.orderMaxGlassesPerNum();
  const pwInp=document.getElementById('aord-pw-input'); if(pwInp)pwInp.value=DB.orderPassword();
  const pwCurr=document.getElementById('aord-pw-current');
  const pw=DB.orderPassword();
  if(pwCurr)pwCurr.textContent=pw?`현재 비밀번호: ${pw}`:'비밀번호 없음 (누구나 입장 가능)';
}
function aordToggleLimitMode(mode){
  DB.saveOrderLimitMode(mode);
  aordApplyLimitModeUI(mode);
  toast(mode==='num'?'번호당 잔 수 제한으로 변경됨':'좌석당 잔 수 제한으로 변경됨','success');
}
function aordApplyLimitModeUI(mode){
  const numSetting=document.getElementById('aord-num-setting');
  const seatBtns=document.querySelectorAll('#aord-pane-settings [onclick^="aordAdjMaxGlasses("]');
  const seatDisplay=document.getElementById('aord-max-glasses-display');
  if(numSetting)numSetting.style.opacity=(mode==='num')?'1':'0.4';
  if(seatDisplay)seatDisplay.style.opacity=(mode==='seat')?'1':'0.4';
  seatBtns.forEach(b=>b.disabled=(mode==='num'));
  const numBtns=document.querySelectorAll('#aord-pane-settings [onclick^="aordAdjMaxGlassesPerNum("]');
  numBtns.forEach(b=>b.disabled=(mode==='seat'));
}
function aordAdjMaxGlasses(delta){
  const next=Math.max(1,Math.min(20,DB.orderMaxGlasses()+delta));
  DB.saveOrderMaxGlasses(next);
  const el=document.getElementById('aord-max-glasses-display'); if(el)el.textContent=next;
  toast(`좌석당 최대 잔 수: ${next}잔`,'success');
}
function aordAdjMaxGlassesPerNum(delta){
  const next=Math.max(1,Math.min(20,DB.orderMaxGlassesPerNum()+delta));
  DB.saveOrderMaxGlassesPerNum(next);
  const el=document.getElementById('aord-max-glasses-per-num-display'); if(el)el.textContent=next;
  toast(`번호당 최대 잔 수: ${next}잔`,'success');
}
function aordSavePassword(){
  const val=(document.getElementById('aord-pw-input')?.value||'').trim();
  DB.saveOrderPassword(val);
  const curr=document.getElementById('aord-pw-current');
  if(curr)curr.textContent=val?`현재 비밀번호: ${val}`:'비밀번호 없음 (누구나 입장 가능)';
  toast(val?`비밀번호 "${val}" 저장됨`:'비밀번호 해제됨','success');
}

const PAGE_BACK={
  'preview-write':'main','preview-view':'main',
  'review-write':'main','review-view':'main','faq':'main',
  'admin-login':'main','admin-main':'main',
  'admin-events':'admin-main',
  'admin-main-manage':'admin-main',
  'admin-schedules':'admin-main',
  'admin-applicants':'admin-main',
  'admin-preview':'admin-main',
  'admin-reviews':'admin-main',
  'admin-res':'admin-main',
  'admin-pq':'admin-main',
  'admin-rq':'admin-main',
  'admin-faq':'admin-main',
  'admin-popup':'admin-main',
  'admin-order':'admin-main',
};

function goBack(){
  const back=PAGE_BACK[currentPage]||'main';
  go(back);
}

// Browser native back/forward support
window.addEventListener('popstate',function(e){
  if(e.state&&e.state.page){
    go(e.state.page,e.state.params||{},false);
  } else {
    go('main',{},false);
  }
});

// Handle hash routing
function handleHash(){
  const hash=location.hash.replace('#/','');
  const map={
    '':'main','preview-write':'preview-write','preview-view':'preview-view',
    'review-write':'review-write','review-view':'review-view','faq':'faq',
    'admin':'admin-main','admin/schedules':'admin-schedules','admin/preview':'admin-preview',
    'admin/reviews':'admin-reviews',
    'admin/res':'admin-res','admin/pq':'admin-pq','admin/rq':'admin-rq','admin/faq':'admin-faq',
  };
  const page=map[hash]||'main';
  go(page);
}

function autoDeactivateExpiredSchedules(){
  const scheds=DB.schedules();
  let changed=false;
  scheds.forEach(s=>{
    if(isScheduleExpired(s)){
      if(s.isVisible){s.isVisible=false;changed=true;}
      if(s.isPreviewActive){s.isPreviewActive=false;changed=true;}
    }
  });
  if(changed)DB.saveSchedules(scheds);
}

// Start (admin)
function startAdmin(){
  checkExpiredFiles();
  autoDeactivateExpiredSchedules();
  if(DB.isAdmin()){
    history.replaceState({page:'admin-main',params:{}},'','#admin-main');
    go('admin-main',{},false);
  } else {
    history.replaceState({page:'admin-login',params:{}},'','#admin-login');
    go('admin-login',{},false);
  }
}
// ═══════════════════════════════════════════════════
//  PWA 푸시 알림
// ═══════════════════════════════════════════════════
const VAPID_PUBLIC_KEY = 'BLjF0oDIomnkZKGqWSN_1AqffP1_ZUuSCt8rYSimCkQezvq8he7J4VoB7UZ-eycoG65t0Eo63xVjB_6RE88VT2Q';

function _vapidToUint8(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}

function _pushAreaOn(){
  const area=document.getElementById('push-setup-area');
  if(!area)return;
  area.innerHTML='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">'
    +'<p style="color:#4caf50;font-size:13px;margin:0;">✅ 신청 알림 켜짐</p>'
    +'<button class="btn" id="push-unsub-btn" onclick="unsubscribePush()" style="font-size:12px;padding:5px 12px;background:#555;color:#fff;border:none;border-radius:6px;cursor:pointer;">🔕 알림 끄기</button>'
    +'</div>';
}

function _pushAreaOff(){
  const area=document.getElementById('push-setup-area');
  if(!area)return;
  area.innerHTML='<button class="btn btn-primary" id="push-setup-btn" onclick="subscribePush()">📱 신청 알림 받기</button>';
}

async function subscribePush(){
  const btn=document.getElementById('push-setup-btn');
  if(btn)btn.disabled=true;
  try{
    const permission=await Notification.requestPermission();
    if(permission!=='granted'){
      const area=document.getElementById('push-setup-area');
      if(area){
        const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
        const guide=isIOS
          ?'기기 설정 앱 → Safari → 알림 → 허용'
          :'브라우저 주소창 자물쇠 아이콘 → 알림 → 허용';
        area.innerHTML='<p style="color:#e57373;font-size:13px;margin:0;">🔕 알림 권한이 거부됐습니다.<br>'+guide+' 후 페이지를 새로고침해주세요.</p>';
      }
      return;
    }
    await navigator.serviceWorker.register('/sangjakting/sw.js');
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:_vapidToUint8(VAPID_PUBLIC_KEY)
    });
    if(_sb){
      await _sb.from('push_subscriptions').upsert({
        endpoint:sub.endpoint,
        subscription:JSON.stringify(sub)
      },{onConflict:'endpoint'});
    }
    toast('신청 알림이 설정되었습니다.','success');
    _pushAreaOn();
  }catch(e){
    console.error('Push subscribe error:',e);
    toast('알림 설정 중 오류가 발생했습니다: '+e.message,'error');
    if(btn)btn.disabled=false;
  }
}

async function unsubscribePush(){
  const btn=document.getElementById('push-unsub-btn');
  if(btn)btn.disabled=true;
  try{
    const reg=await navigator.serviceWorker.getRegistration('/sangjakting/sw.js');
    const sub=reg?await reg.pushManager.getSubscription():null;
    if(sub){
      await sub.unsubscribe();
      if(_sb)await _sb.from('push_subscriptions').delete().eq('endpoint',sub.endpoint);
    }
    toast('알림이 해제되었습니다.','success');
    _pushAreaOff();
  }catch(e){
    console.error('Push unsubscribe error:',e);
    toast('알림 해제 중 오류가 발생했습니다: '+e.message,'error');
    if(btn)btn.disabled=false;
  }
}

async function renderPushArea(){
  const area=document.getElementById('push-setup-area');
  if(!area)return;
  if(!('serviceWorker' in navigator)||!('PushManager' in window)){
    area.innerHTML='<p style="color:#999;font-size:13px">이 브라우저는 푸시 알림을 지원하지 않습니다.</p>';
    return;
  }
  try{
    const reg=await navigator.serviceWorker.getRegistration('/sangjakting/sw.js');
    const sub=reg?await reg.pushManager.getSubscription():null;
    if(sub)_pushAreaOn(); else _pushAreaOff();
  }catch(e){
    _pushAreaOff();
  }
}

initSB();
if(_sb){
  loadFromSB().then(()=>startAdmin());
} else {
  startAdmin();
}
