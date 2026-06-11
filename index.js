


// ═══════════════════════════════════════════════════
//  SUPABASE 설정
// ═══════════════════════════════════════════════════
const SUPABASE_URL = 'https://berxifdazrsbnvlavlaq.supabase.co';      // ← Supabase URL 입력
const SUPABASE_KEY = 'sb_publishable_iJvkQHaIyAZj7vP4yC8Cvg_5pmPEmzG'; // ← Supabase Anon Key 입력

let _sb = null;

function initSB(){
  if(SUPABASE_URL.startsWith('YOUR_')||!window.supabase)return;
  try{_sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);}
  catch(e){console.warn('Supabase init failed:',e);}
}

async function syncToSB(k,v){
  if(!_sb)return;
  try{
    let syncVal=v;
    if(k==='applications') syncVal=(v||[]).map(a=>({...a,fileData:''}));
    if(k==='mainMenuDefs') syncVal=(v||[]).map(m=>({...m,bg:''}));
    await _sb.from('app_data').upsert({key:k,value:JSON.stringify(syncVal)});
  }catch(e){console.warn('Supabase sync error:',k,e.message);}
}

// 특정 일정의 신청자 데이터만 Supabase에서 타겟 동기화
async function syncScheduleApplications(scheduleId){
  if(!_sb)return;
  try{
    const timeout=new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),3000));
    const{data,error}=await Promise.race([
      _sb.from('app_data').select('key,value').or('key.eq.applications,key.like.app_%'),
      timeout
    ]);
    if(error)throw error;
    if(!data)return;
    const mainRow=data.find(r=>r.key==='applications');
    const appRows=data.filter(r=>r.key.startsWith('app_'));
    let local=DB.applications();
    if(mainRow){
      const remote=JSON.parse(mainRow.value||'[]');
      const merged=remote.map(rApp=>{
        const lApp=local.find(l=>l.id===rApp.id);
        return lApp?{...rApp,fileData:lApp.fileData||'',fileName:lApp.fileName||''}:rApp;
      });
      local=merged;
    }
    appRows.forEach(row=>{
      try{
        const rApp=JSON.parse(row.value);
        if(!local.find(l=>l.id===rApp.id))local.push(rApp);
      }catch(e){}
    });
    localStorage.setItem('sjt_applications',JSON.stringify(local));
  }catch(e){
    console.warn('Applications sync failed:',e.message);
  }
}

// 설정 데이터만 Supabase에서 조용히 동기화 (로딩 오버레이 없음)
async function syncSettingsFromSB(){
  if(!_sb)return;
  try{
    const timeout=new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),3000));
    const{data,error}=await Promise.race([
      _sb.from('app_data').select('key,value'),
      timeout
    ]);
    if(error)throw error;
    if(!data)return;
    // application/previews/reviews는 사용자 작성 데이터 → 덮어쓰면 안 됨
    data.filter(r=>!r.key.startsWith('app_')&&r.key!=='applications'&&r.key!=='previews'&&r.key!=='reviews').forEach(row=>{
      if(row.key==='mainMenuDefs'){
        const local=DB.get('mainMenuDefs',null);
        const remote=JSON.parse(row.value||'[]');
        const merged=local?remote.map((d,i)=>({...d,bg:local[i]?.bg||''})):remote;
        localStorage.setItem('sjt_mainMenuDefs',JSON.stringify(merged));
      }else if(row.key==='socialLinks'){
        localStorage.setItem('sjt_socialLinks',row.value);
      }else if(row.key==='noticePopup'){
        const localRaw=localStorage.getItem('sjt_noticePopup');
        if(localRaw){
          try{
            const local=JSON.parse(localRaw);
            const remote=JSON.parse(row.value||'{}');
            if((remote.savedAt||0)>=(local.savedAt||0)){
              localStorage.setItem('sjt_noticePopup',row.value);
            }
          }catch(e){localStorage.setItem('sjt_noticePopup',row.value);}
        }else{
          localStorage.setItem('sjt_noticePopup',row.value);
        }
      }else{
        localStorage.setItem('sjt_'+row.key,row.value);
      }
    });
  }catch(e){
    console.warn('Settings sync failed:',e.message);
  }
}

// 신청 1건을 개별 row로 저장 (race condition 방지)
async function syncApplicationToSB(app){
  if(!_sb)return false;
  const syncApp={...app};
  for(let attempt=0;attempt<3;attempt++){
    try{
      await _sb.from('app_data').upsert({key:'app_'+app.id,value:JSON.stringify(syncApp)});
      return true;
    }catch(e){
      console.warn('Supabase application sync attempt '+(attempt+1)+' failed:',e.message);
      if(attempt<2)await new Promise(r=>setTimeout(r,2000));
    }
  }
  return false;
}

async function loadFromSB(){
  if(!_sb)return;
  try{
    showSBLoading(true);
    // 5초 타임아웃
    const timeout=new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),5000));
    const query=_sb.from('app_data').select('*');
    const{data,error}=await Promise.race([query,timeout]);
    if(error)throw error;
    if(data){
      const appRows=data.filter(row=>row.key.startsWith('app_'));
      const otherRows=data.filter(row=>!row.key.startsWith('app_'));

      otherRows.forEach(row=>{
        if(row.key==='applications'){
          const local=DB.applications();
          const remote=JSON.parse(row.value||'[]');
          const merged=remote.map(rApp=>{
            const lApp=local.find(l=>l.id===rApp.id);
            return lApp?{...rApp,fileData:lApp.fileData||'',fileName:lApp.fileName||''}:rApp;
          });
          localStorage.setItem('sjt_applications',JSON.stringify(merged));
        } else if(row.key==='mainMenuDefs'){
          const local=DB.get('mainMenuDefs',null);
          const remote=JSON.parse(row.value||'[]');
          const merged=local?remote.map((d,i)=>({...d,bg:local[i]?.bg||''})):remote;
          localStorage.setItem('sjt_mainMenuDefs',JSON.stringify(merged));
        } else if(row.key==='socialLinks'){
          localStorage.setItem('sjt_socialLinks',row.value);
        } else if(row.key==='noticePopup'){
          const localRaw=localStorage.getItem('sjt_noticePopup');
          if(localRaw){
            try{
              const local=JSON.parse(localRaw);
              const remote=JSON.parse(row.value||'{}');
              if((remote.savedAt||0)>=(local.savedAt||0)){
                localStorage.setItem('sjt_noticePopup',row.value);
              }
            }catch(e){localStorage.setItem('sjt_noticePopup',row.value);}
          }else{
            localStorage.setItem('sjt_noticePopup',row.value);
          }
        } else {
          localStorage.setItem('sjt_'+row.key,row.value);
        }
      });

      // 개별 신청 row(app_*) 병합 — race condition 방지용으로 저장된 항목들
      if(appRows.length>0){
        const local=DB.applications();
        let changed=false;
        appRows.forEach(row=>{
          try{
            const rApp=JSON.parse(row.value);
            if(!local.find(l=>l.id===rApp.id)){local.push(rApp);changed=true;}
          }catch(e){}
        });
        if(changed)localStorage.setItem('sjt_applications',JSON.stringify(local));
      }
    }
  }catch(e){
    console.warn('Supabase 로드 실패, localStorage 사용:',e.message);
  }finally{
    showSBLoading(false);
  }
}

function showSBLoading(show){
  let el=document.getElementById('sb-loading');
  if(!el){
    el=document.createElement('div');
    el.id='sb-loading';
    el.style.cssText='position:fixed;inset:0;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;gap:16px;';
    el.innerHTML='<img src="" id="sb-logo" style="width:120px;border-radius:50%;display:none;">'
      +'<div style="font-size:22px;color:var(--gold);letter-spacing:3px;">상호작용</div>'
      +'<div style="font-size:13px;color:var(--txt2);">불러오는 중...</div>'
      +'<div style="width:200px;height:2px;background:var(--bg3);border-radius:2px;overflow:hidden;">'
      +'<div id="sb-bar" style="height:100%;background:var(--gold);width:0;transition:width 1.5s ease;border-radius:2px;"></div></div>';
    document.body.appendChild(el);
    // 로고 이미지
    const logoImg=document.querySelector('.site-logo-img img');
    if(logoImg){document.getElementById('sb-logo').src=logoImg.src;document.getElementById('sb-logo').style.display='';}
    setTimeout(()=>{const bar=document.getElementById('sb-bar');if(bar)bar.style.width='80%';},100);
  }
  el.style.display=show?'flex':'none';
}

// ═══════════════════════════════════════════════════
//  DATA LAYER
// ═══════════════════════════════════════════════════
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
  genderSubText:()=>DB.get('genderSubText',''),
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
  setAdmin:v=>DB.set('auth',v),
  events:()=>DB.get('events',[{id:'evt_default',name:'상작팅',isActive:true,previewEnabled:true,reviewEnabled:true,maleCapacity:12,femaleCapacity:12,fileRequired:true}]),
  saveEvents:v=>DB.set('events',v),
  eventPreviewQs:evtId=>evtId==='evt_default'||!evtId?DB.previewQs():DB.get('previewQs_'+evtId,[]),
  eventReviewQs:evtId=>evtId==='evt_default'||!evtId?DB.reviewQs():DB.get('reviewQs_'+evtId,[]),
  getEventReviewFields:evtId=>{
    const evt=DB.events().find(e=>e.id===evtId);
    if(evt&&evt.reviewFields)return evt.reviewFields;
    return [{id:'rf_name',label:'이름',key:'name',enabled:true},{id:'rf_birthdate',label:'생년월일',key:'birthdate',enabled:true},{id:'rf_partdate',label:'참여일자',key:'participationDate',enabled:true},{id:'rf_gender',label:'성별',key:'gender',enabled:true},{id:'rf_number',label:'참석 번호',key:'number',enabled:true}];
  },
  getEventAppFields:evtId=>{
    const evt=DB.events().find(e=>e.id===evtId);
    if(evt&&evt.appFields)return evt.appFields;
    return [{id:'af_name',label:'이름',key:'name',type:'text',enabled:true,isDefault:true},{id:'af_birthdate',label:'생년월일 (8자리)',key:'birthdate',type:'numeric',enabled:true,isDefault:true},{id:'af_phone',label:'전화번호',key:'phone',type:'tel',enabled:true,isDefault:true},{id:'af_occupation',label:'직업',key:'occupation',type:'text',enabled:true,isDefault:true},{id:'af_file',label:'파일 첨부',key:'file',type:'file',enabled:true,isDefault:true},{id:'af_number',label:'번호 선택',key:'number',type:'number',enabled:true,isDefault:true}];
  },
  getEvtCapacity:(scheduleId,gender)=>{
    const sched=DB.schedules().find(s=>s.id===scheduleId);
    if(!sched)return 12;
    return gender==='남'?(sched.maleCapacity||12):(sched.femaleCapacity||12);
  },
  getEvtCapacityByEvt:(evtId,gender)=>{
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
  // ── 칵테일 주문 ──
  orderOrders:()=>DB.get('orders',[]),
  saveOrderOrders:v=>DB.set('orders',v),
  orderMenu:()=>DB.get('order_menu',null),
  saveOrderMenu:v=>DB.set('order_menu',v),
  orderMaxGlasses:()=>DB.get('order_max_glasses',2),
  orderMaxGlassesPerNum:()=>DB.get('order_max_glasses_per_num',2),
  orderLimitMode:()=>DB.get('order_limit_mode','seat'),
  orderPassword:()=>DB.get('order_password',''),
  orderActiveSeats:()=>DB.get('order_active_seats',null),
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
  'application':'page-application',
  'preview-view':'page-preview-view',
  'review':'page-review',
  'faq':'page-faq',
  'admin-login':'page-admin-login',
  'admin-main':'page-admin-main',
  'admin-schedules':'page-admin-schedules',
  'admin-applicants':'page-admin-applicants',
  'admin-preview':'page-admin-preview',
  'admin-reviews':'page-admin-reviews',
  'admin-instagram':'page-admin-instagram',
  'admin-res':'page-admin-res',
  'admin-main-manage':'page-admin-main-manage',
  'admin-pq':'page-admin-pq',
  'admin-rq':'page-admin-rq',
  'admin-faq':'page-admin-faq',
  'order':'page-order',
};
const ADMIN_PAGES=['admin-main','admin-main-manage','admin-schedules','admin-applicants','admin-preview','admin-reviews','admin-instagram','admin-res','admin-pq','admin-rq','admin-faq']; // redirect to admin.html

let currentPage='main';

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

// ── 공지 팝업 ──
function showNoticePopup(){
  const popup=DB.get('noticePopup',{enabled:false,text:'',textEnabled:true,imageData:'',imageEnabled:true});
  if(!popup.enabled)return;
  // 오늘 하루 그만보기 체크
  const today=new Date();
  const todayStr=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  if(localStorage.getItem('sjt_popupHideDate')===todayStr)return;
  // 체크박스 초기화
  setTimeout(()=>{const chk=document.getElementById('popup-hide-today');if(chk)chk.checked=false;},50);
  const overlay=document.getElementById('notice-popup-overlay');
  const textArea=document.getElementById('notice-popup-text-area');
  const imgArea=document.getElementById('notice-popup-img-area');
  const img=document.getElementById('notice-popup-img');

  const showText=popup.textEnabled&&popup.text;
  const showImg=popup.imageEnabled&&popup.imageData;

  if(!showText&&!showImg)return;

  textArea.textContent=popup.text||'';
  textArea.style.display=showText?'':'none';
  imgArea.style.display=showImg?'':'none';
  if(showImg)img.src=popup.imageData;

  // 한쪽만 있을 때 border 제거
  if(!showText||!showImg){
    imgArea.style.borderRight='none';
    imgArea.style.flex=showImg?'1':'0';
    textArea.style.flex=showText?'1':'0';
  } else {
    imgArea.style.borderRight='1px solid rgba(255,255,255,.08)';
    imgArea.style.flex='1';
    textArea.style.flex='1';
  }

  overlay.style.display='flex';
}

function closeNoticePopup(){
  const chk=document.getElementById('popup-hide-today');
  if(chk&&chk.checked){
    const today=new Date();
    const dateStr=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
    localStorage.setItem('sjt_popupHideDate',dateStr);
  }
  document.getElementById('notice-popup-overlay').style.display='none';
}


// ── 작성방법 안내 ──
function renderGuide(areaId, guideKey, defaultOpen=true){
  const area=document.getElementById(areaId);
  if(!area)return;
  const g=DB.get(guideKey,{enabled:false,content:''});
  if(!g.enabled||!g.content){area.innerHTML='';return;}
  const openKey=guideKey+'_open';
  const stored=sessionStorage.getItem(openKey);
  const isOpen=stored!=null?stored!=='false':defaultOpen;
  area.innerHTML=`<div class="guide-box">
    <div class="guide-box-title" onclick="toggleGuide('${areaId}','${guideKey}')">
      <span class="guide-box-title-txt">📋 작성방법 안내</span>
      <button class="guide-toggle-btn" id="${areaId}-btn">${isOpen?'접기':'펼치기'}</button>
    </div>
    <div class="guide-box-content" id="${areaId}-content" style="display:${isOpen?'block':'none'};">${g.content}</div>
  </div>`;
}

function toggleGuide(areaId, guideKey){
  const content=document.getElementById(areaId+'-content');
  const btn=document.getElementById(areaId+'-btn');
  if(!content||!btn)return;
  const isOpen=content.style.display!=='none';
  content.style.display=isOpen?'none':'block';
  btn.textContent=isOpen?'펼치기':'접기';
  sessionStorage.setItem(guideKey+'_open', String(!isOpen));
}


// 외부 링크 열기
function openExtLink(url){
  if(!url){toast('등록된 링크가 없습니다.','error');return;}
  window.open(url,'_blank');
}
function go(page,params={},pushState=true){
  if(ADMIN_PAGES.includes(page)){window.location.href='admin.html';return;}
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
  else if(page==='application')initApplication();
  else if(page==='preview-view')initPV();
  else if(page==='review')initReview();
  else if(page==='faq')initFAQ();
  else if(page==='order')initOrder();
}

//  PAGE 1: MAIN
// ═══════════════════════════════════════════════════
let mainState={scheduleId:null,gender:null,number:null,file:null,fileName:null};
let mainEvtFilter=null;

function getMenuLabel(menuId,fallback){
  const savedDefs=DB.get('mainMenuDefs',null);
  if(savedDefs){
    const saved=savedDefs.find(s=>s.id===menuId);
    if(saved&&saved.label)return saved.label;
  }
  const defaultLabels={
    'pv-view':'참석자 자기소개서 모음','rv-view':'상작팅 후기모음',
    'pv-write':'자기소개서 작성','rv-write':'상작팅 리뷰후기 작성',
    'faq':'상호작용 Q&A'
  };
  return defaultLabels[menuId]||fallback;
}

function setPageTitle(titleId,menuId,fallback){
  const el=document.getElementById(titleId);
  if(el)el.textContent=getMenuLabel(menuId,fallback);
}

function renderMainEventTabs(){
  const events=DB.events().filter(e=>e.isActive);
  const el=document.getElementById('main-event-tabs');
  if(!el)return;
  if(events.length<=1){
    el.closest('.card').style.display='none';
    return;
  }
  el.closest('.card').style.display='';
  el.innerHTML=events.map(e=>`
    <button style="padding:10px 18px;border-radius:var(--r2);font-size:14px;font-weight:500;cursor:pointer;border:2px solid ${mainEvtFilter===e.id?'var(--gold)':'var(--bd)'};background:${mainEvtFilter===e.id?'var(--gold3)':'var(--bg4)'};color:${mainEvtFilter===e.id?'var(--gold)':'var(--txt2)'};transition:all .2s;font-family:'Noto Sans KR',sans-serif;"
    onclick="selectMainEvent('${e.id}')">${e.name}</button>`).join('');
}

function selectMainEvent(evtId){
  mainEvtFilter=evtId;
  mainState.scheduleId=null;
  mainState.number=null;
  document.getElementById('main-schedule-val').textContent='일정을 선택하여 예약해주세요.';
  renderMainEventTabs();
  buildMainScheduleMenu();
  applyMainAppFields(evtId);
  renderNumberGrid();
  updateSubmitBtn();
}

function applyMainAppFields(evtId){
  if(!evtId)return;
  const fields=DB.getEventAppFields(evtId);
  const keyMap={name:'m-field-name',birthdate:'m-field-birthdate',phone:'m-field-phone',occupation:'m-field-occupation',file:'m-field-file',number:null};
  fields.filter(f=>f.isDefault).forEach(f=>{
    const domId=keyMap[f.key];
    if(domId){
      const el=document.getElementById(domId);
      if(el)el.style.display=f.enabled?'':'none';
    }
  });
  // 커스텀 필드 렌더링
  const customFields=fields.filter(f=>!f.isDefault&&f.enabled);
  const customArea=document.getElementById('m-custom-fields');
  if(customArea){
    customArea.innerHTML=customFields.map(f=>`
      <div class="form-group" id="m-custom-${f.id}">
        <label class="form-label">${f.label}</label>
        <input class="form-input" id="m-cf-${f.id}" placeholder="${f.label}을(를) 입력하세요" lang="ko" inputmode="text">
      </div>`).join('');
  }
}

function buildMainScheduleMenu(){
  let scheds=DB.schedules().filter(s=>s.isVisible&&!isScheduleExpired(s)).sort((a,b)=>b.createdAt-a.createdAt);
  if(mainEvtFilter)scheds=scheds.filter(s=>s.eventId===mainEvtFilter);
  const menu=document.getElementById('main-schedule-menu');
  if(!menu)return;
  if(scheds.length===0){
    menu.innerHTML='<div class="dropdown-empty">등록된 일정이 없습니다.</div>';
  }else{
    menu.innerHTML=scheds.map(s=>`
      <div class="dropdown-item" onclick="selectMainSchedule('${s.id}','${s.displayText}')">${s.displayText}</div>
    `).join('');
  }
}

async function initMain(){
  await syncSettingsFromSB();
  // Menu grid
  const defaultDefs=[
    {id:'apply',label:'신청하기',icon:'📋',action:"go('application')",bg:''},
    {id:'order',label:'칵테일 주문',icon:'🍹',action:"go('order')",bg:''},
    {id:'matching',label:'매칭 결과',icon:'💑',action:"openExtLink('https://script.google.com/macros/s/AKfycbxSB1QsTuKsYITuNu5swx1Rzo2rZzApimyFVBWEofF4ZgtJuQ002TAK2mPONC-3xhyhmw/exec')",bg:''},
    {id:'pv-view',label:'자기소개서 모음',icon:'👀',action:"go('preview-view')",bg:''},
    {id:'rv-view',label:'상작팅 후기',icon:'💬',action:"go('review')",bg:''},
    {id:'faq',label:'Q&A',icon:'❓',action:"go('faq')",bg:''},
  ];
  // DB에 저장된 라벨/배경 불러오기 (id 기준으로 매칭)
  const savedDefs=DB.get('mainMenuDefs',null);
  let menuDefs;
  if(savedDefs&&savedDefs.length>0){
    menuDefs=defaultDefs.map(d=>{
      const saved=savedDefs.find(s=>s.id===d.id);
      return saved?{...d,label:saved.label||d.label,bg:saved.bg||'',action:d.action}:d;
    });
  } else {
    menuDefs=defaultDefs;
  }
  const grid=document.getElementById('mainMenuGrid');
  grid.innerHTML=menuDefs.map(it=>`
    <div class="menu-item" onclick="${it.action}" style="${it.bg?'background:url('+it.bg+') center/cover no-repeat;border:none;':''}">
      ${it.bg?'':'<div class="menu-icon">'+it.icon+'</div>'}
      <div style="${it.bg?'background:rgba(0,0,0,.45);padding:6px 10px;border-radius:6px;width:100%;text-align:center;':''}">${it.label}</div>
    </div>`).join('');
  // 소셜 링크 바 렌더링
  renderSocialLinksBar();
  showNoticePopup();

  // phone input
  document.getElementById('m-phone').oninput=formatPhone;
  // 공지 팝업
  showNoticePopup();
}

function getSocialBrandColor(name){
  const n=name.toLowerCase();
  if(n.includes('instagram')) return '#E1306C';
  if(n.includes('naver')||n.includes('네이버')) return '#03C75A';
  if(n.includes('kakao')||n.includes('카카오')) return '#FEE500';
  if(n.includes('youtube')||n.includes('유튜브')) return '#FF0000';
  if(n.includes('facebook')||n.includes('페이스북')) return '#1877F2';
  if(n.includes('twitter')||n.includes('트위터')||n.includes(' x ')) return '#1DA1F2';
  if(n.includes('tiktok')||n.includes('틱톡')) return '#69C9D0';
  if(n.includes('threads')||n.includes('스레드')) return '#AAAAAA';
  return 'var(--gold)';
}
function renderSocialLinksBar(){
  const area=document.getElementById('main-social-links');
  if(!area)return;
  const links=DB.socialLinks();
  if(!links||links.length===0){area.style.display='none';return;}
  area.style.display='flex';
  area.innerHTML=links.map(lk=>{
    const color=getSocialBrandColor(lk.name);
    return `<div class="social-link-btn" onclick="openExtLink('${lk.url||''}')" style="border-left:4px solid ${color};">
      <span style="color:${color};flex:1;text-align:center;">${lk.name}</span>
      <span style="color:${color};font-size:16px;line-height:1;">↗</span>
    </div>`;
  }).join('');
}

async function selectMainSchedule(id,text){
  mainState.scheduleId=id;
  mainState.number=null;
  document.getElementById('main-schedule-val').textContent=text;
  document.getElementById('main-schedule-btn').classList.remove('open');
  document.getElementById('main-schedule-menu').classList.remove('open');
  document.getElementById('numSelectArea').innerHTML='<div class="empty-state" style="padding:16px;">신청 현황 조회 중...</div>';
  await syncScheduleApplications(id);
  renderNumberGrid();
  renderAppPreviewQuestions();
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
    updateSubmitBtn();
  };
  reader.readAsDataURL(file);
}

function updateSubmitBtn(){
  const p=document.getElementById('chk-privacy').checked;
  const r=document.getElementById('chk-res').checked;
  const fileField=document.getElementById('m-field-file');
  let fileOk=true;
  if(fileField&&fileField.style.display!=='none'){
    const fileRequired=mainEvtFilter?DB.getEventFileRequired(mainEvtFilter):true;
    if(fileRequired)fileOk=!!mainState.file;
  }
  let pvOk=true;
  if(mainState.scheduleId){
    const qs=getScheduleQuestions(mainState.scheduleId);
    if(qs.length>0){
      pvOk=qs.every(q=>{
        const el=document.getElementById('app-pv-ans-'+q.id);
        return el&&el.value.trim().length>0;
      });
    }
  }
  const ok=p&&r&&fileOk&&pvOk;
  document.getElementById('submitBtn').disabled=!ok;
  const overlay=document.getElementById('submitBtnOverlay');
  if(overlay)overlay.style.display=ok?'none':'block';
}

function openResModal(){
  renderResModalContent();
  document.getElementById('resModal').classList.add('open');
}
function closeResModal(){document.getElementById('resModal').classList.remove('open');}

function renderResModalContent(){
  // 현재 선택된 이벤트의 안내문구 사용 (없으면 기본값)
  const rm=DB.getEventResMethod(mainEvtFilter);
  const el=document.getElementById('resModalContent');
  el.innerHTML=`
    <div class="res-part" style="margin-bottom:12px;">
      <div class="res-content" style="white-space:pre-line;">${rm.part1}</div>
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
      <div class="res-content" style="color:var(--txt2);font-size:13px;white-space:pre-line;">${rm.part3}</div>
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

async function submitApplication(){
  const btn=document.getElementById('submitBtn');
  if(btn.disabled)return;

  const schedId=mainState.scheduleId;
  const gender=mainState.gender;
  const number=mainState.number;
  const appFields=mainEvtFilter?DB.getEventAppFields(mainEvtFilter):null;
  const fieldEnabled=key=>!appFields||appFields.find(f=>f.key===key)?.enabled!==false;

  const name=document.getElementById('m-name').value.trim();
  const birth=document.getElementById('m-birth').value.trim();
  const phone=document.getElementById('m-phone').value.trim();
  const job=document.getElementById('m-job').value.trim();

  if(!schedId){toast('일정을 선택해주세요.','error');return;}
  if(!gender){toast('성별을 선택해주세요.','error');return;}
  if(fieldEnabled('name')&&!name){toast('이름을 입력해주세요.','error');return;}
  if(fieldEnabled('birthdate')&&birth.length!==8){toast('생년월일을 8자리로 입력해주세요.','error');return;}
  if(fieldEnabled('phone')&&phone.length<12){toast('전화번호를 입력해주세요.','error');return;}
  if(fieldEnabled('occupation')&&!job){toast('직업을 입력해주세요.','error');return;}
  if(!number){toast('참석 번호를 선택해주세요.','error');return;}

  // 파일 첨부 필수 여부 확인
  const fileField=document.getElementById('m-field-file');
  if(fieldEnabled('file')&&fileField&&fileField.style.display!=='none'){
    if(mainEvtFilter&&DB.getEventFileRequired(mainEvtFilter)&&!mainState.file){
      toast('파일을 첨부해주세요.','error');return;
    }
  }

  // 중복 클릭 방지 및 처리 중 표시
  btn.disabled=true;
  btn.textContent='확인 중...';

  // Supabase 최신 신청자 데이터 동기화 후 중복 체크
  await syncScheduleApplications(schedId);
  const taken=getTakenNumbers(schedId,gender);
  if(taken.includes(number)){
    toast('선택한 번호가 이미 신청되었습니다. 다른 번호를 선택해주세요.','error');
    renderNumberGrid();
    btn.disabled=false;
    btn.textContent='예약 신청하기';
    return;
  }

  btn.textContent='저장 중...';

  // 커스텀 필드 수집
  const customData={};
  if(appFields){
    appFields.filter(f=>!f.isDefault&&f.enabled).forEach(f=>{
      const el=document.getElementById('m-cf-'+f.id);
      if(el)customData[f.key]=el.value.trim();
    });
  }

  const now=Date.now();
  const app={
    id:uid(),scheduleId:schedId,gender,number,name,birthdate:birth,
    phone,occupation:job,
    fileName:mainState.fileName||'',
    fileData:mainState.file||'',
    fileSubmittedAt:now,
    submittedAt:now,
    ...customData
  };
  const apps=DB.applications();
  apps.push(app);
  try{localStorage.setItem('sjt_applications',JSON.stringify(apps));}catch(e){}

  // 자기소개서 저장
  const pvQs=getScheduleQuestions(app.scheduleId);
  if(pvQs.length>0){
    const pvAnswers={};
    pvQs.forEach(q=>{const el=document.getElementById('app-pv-ans-'+q.id);if(el)pvAnswers[q.id]=el.value.trim();});
    const prevs=DB.previews();
    const pvIdx=prevs.findIndex(p=>p.scheduleId===app.scheduleId&&p.gender===app.gender&&p.number===app.number);
    const pvEntry={scheduleId:app.scheduleId,gender:app.gender,number:app.number,answers:pvAnswers,updatedAt:Date.now()};
    if(pvIdx>=0)prevs[pvIdx]=pvEntry;else prevs.push(pvEntry);
    DB.savePreviews(prevs);
  }

  const synced=await syncApplicationToSB(app);

  btn.style.display='none';
  const msg=document.getElementById('submitMsg');
  const sched=DB.schedules().find(s=>s.id===schedId);
  if(synced){
    // 신청 완료 즉시 번호 그리드 갱신하여 해당 번호 비활성화
    renderNumberGrid();
    msg.innerHTML='✅ 예약 신청이 완료되었습니다!<br><small style="color:var(--txt2);">확인 후 연락드리겠습니다.</small>';
    toast('예약 신청이 완료되었습니다.','success');
  }else{
    msg.innerHTML='⚠️ 신청이 접수되었으나 서버 저장에 실패했습니다.<br>'
      +'<small style="color:var(--err);">아래 정보를 캡처하여 관리자에게 문의해 주세요.</small>'
      +'<div style="margin-top:8px;background:var(--bg2);border:1px solid var(--bd);border-radius:6px;padding:10px;font-size:12px;color:var(--txt);line-height:1.8;">'
      +'이름: '+name+'<br>'
      +'성별/번호: '+gender+' '+number+'번<br>'
      +'일정: '+(sched?sched.displayText:'')+'<br>'
      +'생년월일: '+birth+'<br>'
      +'전화번호: '+phone
      +'</div>';
    toast('서버 저장 실패 — 관리자에게 문의해 주세요.','error');
  }
  msg.style.display='block';
}

// ═══════════════════════════════════════════════════
//  PAGE 2: RESERVATION METHOD (standalone view from nav if needed)
// ═══════════════════════════════════════════════════
// (Handled as modal in main page)

// ═══════════════════════════════════════════════════
//  PAGE 3: PREVIEW WRITE
// ═══════════════════════════════════════════════════
const pwStates={p4:{scheduleId:null,verifiedApp:null}};
const pwEvtFilters={p4:null};

function initPW(ctx){
  pwStates[ctx]={scheduleId:null,verifiedApp:null};
  const previewEvents=DB.events().filter(e=>e.isActive&&e.previewEnabled);
  if(!pwEvtFilters[ctx]&&previewEvents.length>0)pwEvtFilters[ctx]=previewEvents[0].id;
  renderPWEventTabs(ctx);
  buildPWScheduleMenu(ctx);
  document.getElementById(ctx+'-pw-schedule-val').textContent='일정을 선택해주세요.';
  document.getElementById(ctx+'-pw-name').value='';
  document.getElementById(ctx+'-pw-birth').value='';
  document.getElementById(ctx+'-pw-verify-msg').textContent='';
  document.getElementById(ctx+'-pw-form-area').style.display='none';
  renderGuide(ctx+'-pw-guide-area','previewGuide',false);
}

function renderPWEventTabs(ctx){
  const events=DB.events().filter(e=>e.isActive&&e.previewEnabled);
  const el=document.getElementById(ctx+'-pw-event-tabs');
  if(!el)return;
  if(events.length<=1){el.style.display='none';return;}
  el.style.display='flex';
  el.innerHTML=events.map(e=>`
    <button style="padding:8px 16px;border-radius:var(--r2);font-size:13px;cursor:pointer;border:2px solid ${pwEvtFilters[ctx]===e.id?'var(--gold)':'var(--bd)'};background:${pwEvtFilters[ctx]===e.id?'var(--gold3)':'var(--bg4)'};color:${pwEvtFilters[ctx]===e.id?'var(--gold)':'var(--txt2)'};transition:all .2s;font-family:'Noto Sans KR',sans-serif;"
    onclick="selectPWEvt('${ctx}','${e.id}')">${e.name}</button>`).join('');
}

function selectPWEvt(ctx,evtId){
  pwEvtFilters[ctx]=evtId;
  pwStates[ctx]={scheduleId:null,verifiedApp:null};
  renderPWEventTabs(ctx);
  buildPWScheduleMenu(ctx);
  document.getElementById(ctx+'-pw-schedule-val').textContent='일정을 선택해주세요.';
  document.getElementById(ctx+'-pw-verify-msg').textContent='';
  document.getElementById(ctx+'-pw-form-area').style.display='none';
}

function buildPWScheduleMenu(ctx){
  const scheds=DB.schedules()
    .filter(s=>s.isPreviewActive&&!isScheduleExpired(s)&&(!pwEvtFilters[ctx]||s.eventId===pwEvtFilters[ctx]))
    .sort((a,b)=>b.createdAt-a.createdAt);
  const menu=document.getElementById(ctx+'-pw-schedule-menu');
  if(!menu)return;
  if(scheds.length===0){
    menu.innerHTML='<div class="dropdown-empty">활성화된 일정이 없습니다.</div>';
  }else{
    menu.innerHTML=scheds.map(s=>`
      <div class="dropdown-item" onclick="selectPWSchedule('${ctx}','${s.id}','${s.displayText}')">${s.displayText}</div>
    `).join('');
  }
}

function selectPWSchedule(ctx,id,text){
  pwStates[ctx].scheduleId=id;
  pwStates[ctx].verifiedApp=null;
  document.getElementById(ctx+'-pw-schedule-val').textContent=text;
  document.getElementById(ctx+'-pw-schedule-btn').classList.remove('open');
  document.getElementById(ctx+'-pw-schedule-menu').classList.remove('open');
  document.getElementById(ctx+'-pw-form-area').style.display='none';
  document.getElementById(ctx+'-pw-verify-msg').textContent='';
}

async function verifyWriter(ctx){
  const state=pwStates[ctx];
  if(!state.scheduleId){toast('일정을 먼저 선택해주세요.','error');return;}
  const name=document.getElementById(ctx+'-pw-name').value.trim();
  const birth=document.getElementById(ctx+'-pw-birth').value.trim();
  if(!name||!birth){toast('이름과 생년월일을 입력해주세요.','error');return;}
  const msg=document.getElementById(ctx+'-pw-verify-msg');
  const findApp=()=>DB.applications().find(a=>a.scheduleId===state.scheduleId&&a.name===name&&a.birthdate===birth);
  let app=findApp();
  if(!app&&_sb){
    msg.className='text-sm mt8 text-muted';
    msg.textContent='데이터 확인 중...';
    await syncScheduleApplications(state.scheduleId);
    app=findApp();
  }
  if(!app){
    msg.className='text-sm mt8 text-err';
    msg.textContent='신청자 현황과 일치하지 않습니다.';
    document.getElementById(ctx+'-pw-form-area').style.display='none';
    state.verifiedApp=null;
    return;
  }
  state.verifiedApp=app;
  msg.className='text-sm mt8 text-ok';
  msg.textContent=`확인되었습니다. (${app.gender}자 ${app.number}번)`;
  renderPWForm(ctx);
  loadPrevPreview(ctx);
}

function renderPWForm(ctx){
  const state=pwStates[ctx];
  const qs=getScheduleQuestions(state.scheduleId);
  const area=document.getElementById(ctx+'-pw-form-area');
  if(qs.length===0){area.innerHTML='<div class="empty-state">등록된 질문이 없습니다.</div>';area.style.display='block';return;}
  let html='<div class="card-hd">자기소개서 작성</div>';
  qs.forEach(q=>{
    html+=`<div class="form-group">
      <label class="form-label" style="font-size:15px;color:var(--gold);font-weight:600;">Q${q.order}. ${q.content}</label>
      <textarea class="form-textarea" id="${ctx}-pw-ans-${q.id}" placeholder="내용을 입력하세요"></textarea>
    </div>`;
  });
  html+=`<button class="btn btn-primary btn-full mt16" onclick="savePreview('${ctx}')">작성(수정) 완료</button>`;
  area.innerHTML=html;
  area.style.display='block';
}

function loadPrevPreview(ctx){
  const state=pwStates[ctx];
  if(!state.verifiedApp)return;
  const{scheduleId,gender,number}=state.verifiedApp;
  const prev=DB.previews().find(p=>p.scheduleId===scheduleId&&p.gender===gender&&p.number===number);
  if(!prev)return;
  const qs=getScheduleQuestions(scheduleId);
  qs.forEach(q=>{
    const el=document.getElementById(ctx+'-pw-ans-'+q.id);
    if(el&&prev.answers[q.id])el.value=prev.answers[q.id];
  });
  toast('이전 작성 내용을 불러왔습니다.','info');
}

function savePreview(ctx){
  const state=pwStates[ctx];
  if(!state.verifiedApp){toast('작성자 확인이 필요합니다.','error');return;}
  const{scheduleId,gender,number,name,birthdate}=state.verifiedApp;
  const stillValid=DB.applications().some(a=>
    a.scheduleId===scheduleId&&a.gender===gender&&a.number===number&&
    a.name===name&&a.birthdate===birthdate
  );
  if(!stillValid){
    toast('신청 정보를 확인할 수 없습니다. 다시 인증해주세요.','error');
    document.getElementById(ctx+'-pw-form-area').style.display='none';
    state.verifiedApp=null;
    return;
  }
  const qs=getScheduleQuestions(scheduleId);
  const answers={};
  let hasAll=true;
  qs.forEach(q=>{
    const el=document.getElementById(ctx+'-pw-ans-'+q.id);
    const val=el?el.value.trim():'';
    if(!val)hasAll=false;
    answers[q.id]=val;
  });
  if(!hasAll){toast('모든 질문에 답변해주세요.','error');return;}
  const prevs=DB.previews();
  const idx=prevs.findIndex(p=>p.scheduleId===scheduleId&&p.gender===gender&&p.number===number);
  const entry={scheduleId,gender,number,answers,updatedAt:Date.now()};
  if(idx>=0)prevs[idx]=entry;else prevs.push(entry);
  DB.savePreviews(prevs);
  toast('자기소개서가 저장되었습니다.','success');
}

// ═══════════════════════════════════════════════════
//  PAGE 19: APPLICATION (신청하기)
// ═══════════════════════════════════════════════════
async function initApplication(){
  await syncSettingsFromSB();
  const activeEvents=DB.events().filter(e=>e.isActive);
  if(!mainEvtFilter&&activeEvents.length>0)mainEvtFilter=activeEvents[0].id;
  renderMainEventTabs();
  buildMainScheduleMenu();
  if(mainEvtFilter)applyMainAppFields(mainEvtFilter);
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
  document.getElementById('submitMsg').style.display='none';
  document.getElementById('submitBtn').style.display='';
  document.getElementById('numSelectArea').innerHTML='<div class="empty-state" style="padding:16px;">일정과 성별을 먼저 선택해주세요.</div>';
  renderAppPreviewQuestions();
  updateSubmitBtn();
  const gst=DB.genderSubText();
  const gstEl=document.getElementById('gender-sub-text');
  if(gstEl){gstEl.textContent=gst;gstEl.style.display=gst?'block':'none';}
}

function renderAppPreviewQuestions(){
  const section=document.getElementById('app-preview-section');
  const container=document.getElementById('app-preview-questions');
  if(!section||!container)return;
  if(!mainState.scheduleId){section.style.display='none';return;}
  const qs=getScheduleQuestions(mainState.scheduleId);
  if(qs.length===0){section.style.display='none';return;}
  container.innerHTML=qs.map(q=>`<div class="form-group">
    <label class="form-label" style="font-size:15px;color:var(--gold);font-weight:600;">Q${q.order}. ${q.content}</label>
    <textarea class="form-textarea" id="app-pv-ans-${q.id}" placeholder="내용을 입력하세요" oninput="updateSubmitBtn()"></textarea>
  </div>`).join('');
  section.style.display='';
}

// ═══════════════════════════════════════════════════
//  PAGE 4: PREVIEW VIEW
// ═══════════════════════════════════════════════════
let pvState={scheduleId:null,selected:null};

let pvEvtFilter=null;

async function initPV(){
  await syncSettingsFromSB();
  setPageTitle('pv-page-title','pv-view','Preview');
  pvState={scheduleId:null,selected:null};
  const events=DB.events().filter(e=>e.isActive&&e.previewEnabled);
  if(!pvEvtFilter&&events.length>0)pvEvtFilter=events[0].id;
  renderPVEventTabsPublic();
  buildPVScheduleMenu();
  document.getElementById('pv-schedule-val').textContent='일정을 선택해주세요.';
  document.getElementById('pv-people-area').style.display='none';
  setupTopBtn('pv-top-btn');
  switchPVTab('view');
}

function switchPVTab(tab){
  const vc=document.getElementById('pv-tab-view-content');
  const wc=document.getElementById('pv-tab-write-content');
  const bv=document.getElementById('pv-tab-btn-view');
  const bw=document.getElementById('pv-tab-btn-write');
  const gold='2px solid var(--gold)',none='2px solid transparent';
  if(tab==='view'){
    vc.style.display='';wc.style.display='none';
    bv.style.borderBottom=gold;bv.style.color='var(--gold)';
    bw.style.borderBottom=none;bw.style.color='var(--txt2)';
  }else{
    vc.style.display='none';wc.style.display='';
    bv.style.borderBottom=none;bv.style.color='var(--txt2)';
    bw.style.borderBottom=gold;bw.style.color='var(--gold)';
    initPW('p4');
  }
}

function renderPVEventTabsPublic(){
  const events=DB.events().filter(e=>e.isActive&&e.previewEnabled);
  const el=document.getElementById('pv-event-tabs-public');
  if(!el)return;
  if(events.length<=1){el.style.display='none';return;}
  el.style.display='flex';
  el.innerHTML=events.map(e=>`
    <button style="padding:8px 16px;border-radius:var(--r2);font-size:13px;cursor:pointer;border:2px solid ${pvEvtFilter===e.id?'var(--gold)':'var(--bd)'};background:${pvEvtFilter===e.id?'var(--gold3)':'var(--bg4)'};color:${pvEvtFilter===e.id?'var(--gold)':'var(--txt2)'};transition:all .2s;font-family:'Noto Sans KR',sans-serif;"
    onclick="selectPVEvtPublic('${e.id}')">${e.name}</button>`).join('');
}

function selectPVEvtPublic(evtId){
  pvEvtFilter=evtId;
  pvState={scheduleId:null,selected:null};
  renderPVEventTabsPublic();
  buildPVScheduleMenu();
  document.getElementById('pv-schedule-val').textContent='일정을 선택해주세요.';
  document.getElementById('pv-people-area').style.display='none';
}

function buildPVScheduleMenu(){
  let scheds=DB.schedules().sort((a,b)=>b.createdAt-a.createdAt);
  if(pvEvtFilter)scheds=scheds.filter(s=>s.eventId===pvEvtFilter);
  const menu=document.getElementById('pv-schedule-menu');
  if(!menu)return;
  if(scheds.length===0){
    menu.innerHTML='<div class="dropdown-empty">등록된 일정이 없습니다.</div>';
  }else{
    menu.innerHTML=scheds.map(s=>`
      <div class="dropdown-item" onclick="selectPVSchedule('${s.id}','${s.displayText}')">${s.displayText}</div>
    `).join('');
  }
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
  const previews=DB.previews();
  ['male','female'].forEach(g=>{
    const gender=g==='male'?'남':'여';
    const grid=document.getElementById(`pv-${g}-grid`);
    const capacity=DB.getEvtCapacity(pvState.scheduleId,gender);
    let html='';
    for(let i=1;i<=capacity;i++){
      const isActive=pvState.selected&&pvState.selected.gender===gender&&pvState.selected.number===i;
      const hasPreview=previews.some(p=>p.scheduleId===pvState.scheduleId&&p.gender===gender&&p.number===i);
      html+=`<button class="person-btn ${isActive?'active':''} ${!isActive&&hasPreview?'has-preview':''}" onclick="selectPVPerson('${gender}',${i})">${gender}자 ${i}번</button>`;
    }
    grid.innerHTML=html;
  });
}

function selectPVPerson(gender,number){
  pvState.selected={gender,number};
  renderPVGrid();
  const prev=DB.previews().find(p=>p.scheduleId===pvState.scheduleId&&p.gender===gender&&p.number===number);
  const qs=getScheduleQuestions(pvState.scheduleId);
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
//  PAGE 5+6: REVIEW (merged)
// ═══════════════════════════════════════════════════
async function initReview(){
  await syncSettingsFromSB();
  switchRVTab('view');
  initRV(1);
}

function switchRVTab(tab){
  const vc=document.getElementById('rv-tab-view-content');
  const wc=document.getElementById('rv-tab-write-content');
  const bv=document.getElementById('rv-tab-btn-view');
  const bw=document.getElementById('rv-tab-btn-write');
  const gold='2px solid var(--gold)',none='2px solid transparent';
  if(tab==='view'){
    vc.style.display='';wc.style.display='none';
    bv.style.borderBottom=gold;bv.style.color='var(--gold)';
    bw.style.borderBottom=none;bw.style.color='var(--txt2)';
  }else{
    vc.style.display='none';wc.style.display='';
    bv.style.borderBottom=none;bv.style.color='var(--txt2)';
    bw.style.borderBottom=gold;bw.style.color='var(--gold)';
    initRW();
  }
}

let rwState={gender:null,number:null,verified:false};

function renderRWEventSelector(){
  const events=DB.events().filter(e=>e.isActive&&e.reviewEnabled);
  const el=document.getElementById('rw-event-selector');
  if(!el)return;
  if(events.length<=1){el.style.display='none';return;}
  el.style.display='';
  el.innerHTML='<label class="form-label">이벤트 분류</label><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">'
    +events.map(e=>`<button style="padding:8px 14px;border-radius:var(--r2);font-size:13px;cursor:pointer;border:2px solid ${rwState.eventId===e.id?'var(--gold)':'var(--bd)'};background:${rwState.eventId===e.id?'var(--gold3)':'var(--bg4)'};color:${rwState.eventId===e.id?'var(--gold)':'var(--txt2)'};transition:all .2s;font-family:inherit;" onclick="selectRWEvent(\'${e.id}\')">${e.name}</button>`).join('')
    +'</div>';
}

function selectRWEvent(evtId){
  rwState.eventId=evtId;
  rwState.verified=false;
  document.getElementById('rw-verify-msg').textContent='';
  renderRWEventSelector();
  applyRWReviewFields();
  renderRWForm();
  // 번호 목록 갱신
  const cap=DB.getEvtCapacityByEvt(evtId,'남');
  const capF=DB.getEvtCapacityByEvt(evtId,'여');
  const maxCap=Math.max(cap,capF);
  let html='';
  for(let i=1;i<=maxCap;i++)html+=`<div class="dropdown-item" onclick="selectRwNum(${i})">${i}번</div>`;
  document.getElementById('rw-num-menu').innerHTML=html;
}

function applyRWReviewFields(){
  const evtId=rwState.eventId||'evt_default';
  const fields=DB.getEventReviewFields(evtId);
  const fieldMap={name:'rw-field-name',birthdate:'rw-field-birthdate',participationDate:'rw-field-partdate',gender:'rw-field-gender',number:'rw-field-number'};
  fields.forEach(f=>{
    const el=document.getElementById(fieldMap[f.key]);
    if(el)el.style.display=f.enabled?'':'none';
  });
}

async function initRW(){
  await syncSettingsFromSB();
  setPageTitle('rw-page-title','rv-write','Review 작성');
  rwState={gender:null,number:null,verified:false,eventId:null};
  // 이벤트 선택기 렌더링
  const reviewEvents=DB.events().filter(e=>e.isActive&&e.reviewEnabled);
  if(!rwState.eventId&&reviewEvents.length>0)rwState.eventId=reviewEvents[0].id;
  renderRWEventSelector();
  applyRWReviewFields();
  document.getElementById('rw-name').value='';
  document.getElementById('rw-birth').value='';
  document.getElementById('rw-partdate').value='';
  document.getElementById('rw-gender-val').textContent='선택해주세요';
  document.getElementById('rw-num-val').textContent='선택해주세요';
  document.getElementById('rw-verify-msg').textContent='';
  document.getElementById('rw-done-msg').style.display='none';
  renderGuide('rw-guide-area','reviewGuide');
  // Render review questions immediately (default event)
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

async function verifyRWParticipant(){
  const name=document.getElementById('rw-name').value.trim();
  const birth=document.getElementById('rw-birth').value.trim();
  const pdate=document.getElementById('rw-partdate').value.trim();
  const msg=document.getElementById('rw-verify-msg');

  const findMatch=()=>{
    const scheds=DB.schedules();
    return DB.applications().find(a=>{
      if(a.name!==name||a.birthdate!==birth)return false;
      const sched=scheds.find(s=>s.id===a.scheduleId);
      if(!sched)return false;
      const schedDate=`${sched.year}${String(sched.month).padStart(2,'0')}${String(sched.day).padStart(2,'0')}`;
      return schedDate===pdate;
    });
  };

  let matched=findMatch();

  // 로컬에서 못 찾으면 Supabase에서 신청자 데이터만 타겟 동기화 후 재시도
  if(!matched&&_sb){
    msg.className='text-sm mt8 text-muted';
    msg.textContent='데이터 확인 중...';
    await syncScheduleApplications(null);
    matched=findMatch();
  }

  if(!matched){
    msg.className='text-sm mt8 text-err';
    msg.textContent='참석자 현황과 일치하지 않습니다.';
    const btn5=document.getElementById('rw-submit-btn');
    if(btn5)btn5.disabled=true;
    rwState.verified=false;
    return;
  }
  rwState.verified=true;
  const matchedSched=DB.schedules().find(s=>s.id===matched.scheduleId);
  rwState.eventId=matchedSched?matchedSched.eventId||'evt_default':'evt_default';
  msg.className='text-sm mt8 text-ok';
  msg.textContent='확인되었습니다.';
  renderRWForm();
}
function renderRWForm(){
  const evtId=rwState.eventId||'evt_default';
  const qs=DB.eventReviewQs(evtId).sort((a,b)=>a.order-b.order);
  const area=document.getElementById('rw-form-area');
  let html='<div class="card-hd">리뷰 작성</div>';
  const rwEmojis=['💬','✨','🌟','💫','🎯','🌸','💝','🎀','🌙','⭐'];
  qs.forEach((q,qi)=>{
    const em=rwEmojis[qi%rwEmojis.length];
    html+=`<div class="form-group">
      <label class="form-label" style="font-size:15px;color:var(--gold);font-weight:600;">${em} ${q.content}</label>
      <textarea class="form-textarea" id="rw-ans-${q.id}" placeholder="내용을 입력하세요" oninput="checkRwSubmit()"></textarea>
    </div>`;
  });
  area.innerHTML=html+`<button class="btn btn-primary btn-full mt16" id="rw-submit-btn" disabled onclick="submitReview()">작성 완료</button>`;
  area.style.display='block';
}

function checkRwSubmit(){
  const evtId=rwState.eventId||'evt_default';
  const qs=DB.eventReviewQs(evtId);
  const allFilled=qs.every(q=>{
    const el=document.getElementById('rw-ans-'+q.id);
    return el&&el.value.trim().length>0;
  });
  const btn=document.getElementById('rw-submit-btn');
  if(btn)btn.disabled=!allFilled||!rwState.verified;
}

function submitReview(){
  if(!rwState.verified){toast('참석자 확인이 필요합니다.','error');return;}
  const evtId=rwState.eventId||'evt_default';
  const qs=DB.eventReviewQs(evtId);
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
    eventId:evtId,
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

// ─── REVIEW VIEW ───
let rvPage=1;
const RV_PER_PAGE=3;

let rvEvtFilter=null;

async function initRV(page){
  await syncSettingsFromSB();
  setPageTitle('rv-page-title','rv-view','Review');
  rvPage=page||1;
  // 이벤트 탭 렌더링
  const events=DB.events().filter(e=>e.reviewEnabled);
  if(!rvEvtFilter&&events.length>0)rvEvtFilter=events[0].id;
  renderRVEventTabsPublic();
  renderRV();
}

function renderRVEventTabsPublic(){
  const events=DB.events().filter(e=>e.reviewEnabled);
  const el=document.getElementById('rv-event-tabs-public');
  if(!el)return;
  if(events.length<=1){el.style.display='none';return;}
  el.style.display='flex';
  el.innerHTML=events.map(e=>`
    <button style="padding:8px 16px;border-radius:var(--r2);font-size:13px;cursor:pointer;border:2px solid ${rvEvtFilter===e.id?'var(--gold)':'var(--bd)'};background:${rvEvtFilter===e.id?'var(--gold3)':'var(--bg4)'};color:${rvEvtFilter===e.id?'var(--gold)':'var(--txt2)'};transition:all .2s;font-family:'Noto Sans KR',sans-serif;"
    onclick="selectRVEvt('${e.id}')">${e.name}</button>`).join('');
}

function selectRVEvt(evtId){
  rvEvtFilter=evtId;
  rvPage=1;
  renderRVEventTabsPublic();
  renderRV();
}

function renderRV(){
  let allReviews=DB.reviews().sort((a,b)=>b.createdAt-a.createdAt);
  const reviews=rvEvtFilter?allReviews.filter(r=>(!r.eventId&&rvEvtFilter==='evt_default')||r.eventId===rvEvtFilter):allReviews;
  const empty=document.getElementById('rv-empty');
  const list=document.getElementById('rv-list');
  if(reviews.length===0){empty.style.display='block';list.innerHTML='';document.getElementById('rv-pagination').innerHTML='';return;}
  empty.style.display='none';
  const start=(rvPage-1)*RV_PER_PAGE;
  const slice=reviews.slice(start,start+RV_PER_PAGE);
  const qs=DB.eventReviewQs(rvEvtFilter||'evt_default').sort((a,b)=>a.order-b.order);
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
  renderPagination('rv-pagination',rvPage,reviews.length,RV_PER_PAGE,'rvPageChange');
}

function rvPageChange(p){rvPage=p;renderRV();}

// ═══════════════════════════════════════════════════
//  PAGE 7: FAQ
// ═══════════════════════════════════════════════════
async function initFAQ(){
  await syncSettingsFromSB();
  setPageTitle('faq-page-title','faq','상호작용 FAQ');
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


function isScheduleExpired(s){
  const today=new Date();today.setHours(0,0,0,0);
  return new Date(s.year,s.month-1,s.day)<today;
}

// 만료된 파일 정리
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
//  뒤로가기
// ═══════════════════════════════════════════════════
const PAGE_BACK={
  'application':'main','preview-view':'main',
  'review':'main','faq':'main','order':'main',
};

function goBack(){
  const back=PAGE_BACK[currentPage]||'main';
  go(back);
}

window.addEventListener('popstate',function(e){
  if(e.state&&e.state.page){
    go(e.state.page,e.state.params||{},false);
  } else {
    go('main',{},false);
  }
});

// ═══════════════════════════════════════════════════
//  칵테일 주문 (ORDER)
// ═══════════════════════════════════════════════════
const ORD_SEAT_POSITIONS={
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
const ORD_MENU_DEFAULTS=[
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
const ORD_CATS=[
  {key:'HIGH',label:'HIGH',      color:'#e07070'},
  {key:'MID', label:'MIDDLE~LOW',color:'#c9a96e'},
  {key:'NON', label:'NON-ALCOL', color:'#52c98a'},
];
let ordActiveMenu=[];
let ordS={gender:null,num:null,seat:null,items:[]};

function ordInitMenu(){
  const saved=DB.orderMenu();
  ordActiveMenu=(saved&&saved.length)?saved:ORD_MENU_DEFAULTS.map(m=>({...m}));
}
function ordGetActiveSeats(){
  const saved=DB.orderActiveSeats();
  return saved!==null?saved:Object.keys(ORD_SEAT_POSITIONS).map(Number);
}
function ordSeatGlassCount(seatNum){
  return DB.orderOrders().filter(o=>o.seatNumber===seatNum).reduce((s,o)=>s+o.items.length,0);
}
function ordNumGlassCount(gender,num){
  return DB.orderOrders().filter(o=>o.gender===gender&&o.datingNumber===num).reduce((s,o)=>s+o.items.length,0);
}
function ordToast(msg,type='info'){
  const w=document.getElementById('ord-toast-w');
  if(!w)return;
  const t=document.createElement('div');
  t.style.cssText='background:var(--bg4);border:1px solid var(--bd);color:var(--txt);padding:10px 22px;border-radius:var(--r2);font-size:13px;white-space:nowrap;box-shadow:0 2px 12px rgba(0,0,0,.5);';
  if(type==='success')t.style.color='var(--ok)';
  if(type==='error')t.style.color='var(--err)';
  t.textContent=msg; w.appendChild(t);
  setTimeout(()=>t.remove(),3000);
}
function ordEsc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

async function initOrder(){
  await syncSettingsFromSB();
  ordInitMenu();
  ordS={gender:null,num:null,seat:null,items:[]};
  ['ord-step1','ord-step2','ord-pending'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
  const s0=document.getElementById('ord-step0'); if(s0)s0.style.display='';
  const pwi=document.getElementById('ord-pw-input'); if(pwi)pwi.value='';
  const pwe=document.getElementById('ord-pw-err'); if(pwe)pwe.style.display='none';
  const maleBtn=document.getElementById('ord-male'); if(maleBtn)maleBtn.classList.remove('selected');
  const femaleBtn=document.getElementById('ord-female'); if(femaleBtn)femaleBtn.classList.remove('selected');
  const numArea=document.getElementById('ord-num-area'); if(numArea)numArea.style.display='none';
  // 비밀번호 없으면 바로 1단계
  if(!String(DB.orderPassword()).trim()) ordEnterOrder();
}

function ordCheckPassword(){
  const inp=document.getElementById('ord-pw-input');
  const val=(inp.value||'').trim();
  const pw=String(DB.orderPassword()).trim();
  const errEl=document.getElementById('ord-pw-err');
  if(!val){errEl.textContent='비밀번호를 입력해주세요.';errEl.style.display='';return;}
  if(val!==pw){errEl.textContent='비밀번호가 맞지 않습니다.';errEl.style.display='';inp.value='';return;}
  errEl.style.display='none';
  ordEnterOrder();
}
function ordEnterOrder(){
  const s0=document.getElementById('ord-step0'); if(s0)s0.style.display='none';
  const s1=document.getElementById('ord-step1'); if(s1)s1.style.display='';
}

function ordSelectGender(g){
  ordS.gender=g; ordS.num=null;
  const maleBtn=document.getElementById('ord-male'); if(maleBtn)maleBtn.classList.toggle('selected',g==='남');
  const femaleBtn=document.getElementById('ord-female'); if(femaleBtn)femaleBtn.classList.toggle('selected',g==='여');
  const grid=document.getElementById('ord-num-grid');
  if(!grid)return;
  grid.innerHTML='';
  const isNumMode=DB.orderLimitMode()==='num';
  const maxPerNum=DB.orderMaxGlassesPerNum();
  for(let i=1;i<=12;i++){
    const b=document.createElement('button');
    const exhausted=isNumMode&&ordNumGlassCount(g,i)>=maxPerNum;
    b.className='num-btn'+(exhausted?' taken':'');
    b.textContent=i+'번';
    if(exhausted){b.disabled=true;}
    else{b.onclick=(()=>{const n=i;return()=>ordPickNum(n);})();}
    grid.appendChild(b);
  }
  const numArea=document.getElementById('ord-num-area'); if(numArea)numArea.style.display='';
}

function ordPickNum(num){
  ordS.num=num;
  const pending=DB.orderOrders().find(o=>o.gender===ordS.gender&&o.datingNumber===num&&o.status==='pending');
  if(pending){ordShowPending(pending);return;}
  const s1=document.getElementById('ord-step1'); if(s1)s1.style.display='none';
  const s2=document.getElementById('ord-step2'); if(s2)s2.style.display='';
  ordRenderSeats();
}

function ordBackToStep1(){
  ordS.num=null;
  const s1=document.getElementById('ord-step1'); if(s1)s1.style.display='';
  const s2=document.getElementById('ord-step2'); if(s2)s2.style.display='none';
  if(ordS.gender)ordSelectGender(ordS.gender);
}

function ordRenderSeats(){
  const active=ordGetActiveSeats(), ol=document.getElementById('ord-seat-ol');
  if(!ol)return;
  ol.innerHTML=Object.entries(ORD_SEAT_POSITIONS).map(([id,p])=>{
    const n=parseInt(id), on=active.includes(n);
    return `<button onclick="${on?`ordPickSeat(${n})`:'void(0)'}" title="${on?n+'번 자리 선택':'비활성화된 자리'}"
      style="position:absolute;left:${p.x}%;top:${p.y}%;transform:translate(-50%,-50%);
      width:29px;height:29px;border-radius:50%;padding:0;font-family:inherit;
      border:${on?'2px solid rgba(201,169,110,.8)':'2px solid #0c0b16'};
      background:${on?'rgba(201,169,110,.08)':'#0c0b16'};
      cursor:${on?'pointer':'default'};"></button>`;
  }).join('');
}

function ordPickSeat(n){
  ordS.seat=n; ordS.items=[];
  const isNumMode=DB.orderLimitMode()==='num';
  const maxG=isNumMode?DB.orderMaxGlassesPerNum():DB.orderMaxGlasses();
  const used=isNumMode?ordNumGlassCount(ordS.gender,ordS.num):ordSeatGlassCount(n);
  const seatEl=document.getElementById('ord-menu-seat-num'); if(seatEl)seatEl.textContent=n;
  const capEl=document.getElementById('ord-menu-capacity-info');
  if(capEl)capEl.textContent=isNumMode?`내 남은 잔: ${maxG-used} / ${maxG}`:`남은 잔 수: ${maxG-used} / ${maxG}`;
  const modal=document.getElementById('ord-menu-modal'); if(modal)modal.style.display='';
  ordRenderMenuItems();
}

function ordRenderMenuItems(){
  const list=document.getElementById('ord-menu-list'); if(!list)return;
  const isNumMode=DB.orderLimitMode()==='num';
  const maxG=isNumMode?DB.orderMaxGlassesPerNum():DB.orderMaxGlasses();
  const used=isNumMode?ordNumGlassCount(ordS.gender,ordS.num):ordSeatGlassCount(ordS.seat);
  const remaining=maxG-used, canAdd=ordS.items.length<remaining;
  function itemHtml(m){
    const sel=ordS.items.includes(m.id), disabled=!sel&&!canAdd;
    return `<div onclick="${disabled?'void(0)':`ordToggleItem('${m.id}')`}"
      style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:var(--r2);
      cursor:${disabled?'not-allowed':'pointer'};transition:.15s;opacity:${disabled?'.4':'1'};
      background:${sel?'var(--gold3)':disabled?'transparent':'var(--bg4)'};
      border:1px solid ${sel?'rgba(201,169,110,.4)':disabled?'var(--bd)':'var(--bd2)'};margin-bottom:6px;">
      <div style="width:20px;height:20px;border-radius:4px;flex-shrink:0;
        border:2px solid ${sel?'var(--gold)':'rgba(201,169,110,.4)'};background:${sel?'var(--gold)':'transparent'};
        display:flex;align-items:center;justify-content:center;font-size:12px;color:#000;font-weight:700;">${sel?'✓':''}</div>
      <div style="flex:1;">
        <div style="font-size:15px;color:${sel?'var(--gold)':'var(--txt)'};">
          ${ordEsc(m.name)}${m.abv?` <span style="font-size:12px;font-weight:400;color:${sel?'rgba(201,169,110,.7)':'var(--txt3)'};">(${ordEsc(m.abv)})</span>`:''}
        </div>
        ${m.desc?`<div style="font-size:12px;color:var(--txt2);margin-top:3px;">${ordEsc(m.desc)}</div>`:''}
      </div>
    </div>`;
  }
  const activeCats=ORD_CATS.filter(c=>ordActiveMenu.some(m=>(m.category||'MID')===c.key));
  let html=`<div style="display:flex;gap:6px;margin-bottom:14px;">`;
  activeCats.forEach(c=>{
    html+=`<div style="padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.08em;border:1px solid ${c.color};color:${c.color};background:${c.color}22;">${c.label}</div>`;
  });
  html+=`</div>`;
  ORD_CATS.forEach(cat=>{
    const items=ordActiveMenu.filter(m=>(m.category||'MID')===cat.key); if(!items.length)return;
    html+=`<div style="font-size:11px;font-weight:700;letter-spacing:.1em;color:${cat.color};padding:8px 2px;border-top:1px solid var(--bd);margin-top:2px;">${cat.label}</div>`;
    html+=items.map(m=>itemHtml(m)).join('');
  });
  list.innerHTML=html;
  ordUpdateSelDisplay();
}

function ordToggleItem(id){
  const i=ordS.items.indexOf(id);
  if(i>=0){ordS.items.splice(i,1);}
  else{
    const isNumMode=DB.orderLimitMode()==='num';
    const rem=(isNumMode?DB.orderMaxGlassesPerNum():DB.orderMaxGlasses())
             -(isNumMode?ordNumGlassCount(ordS.gender,ordS.num):ordSeatGlassCount(ordS.seat));
    if(ordS.items.length>=rem){ordToast(`최대 ${rem}잔까지 선택 가능합니다.`,'error');return;}
    ordS.items.push(id);
  }
  ordRenderMenuItems();
}
function ordUpdateSelDisplay(){
  const el=document.getElementById('ord-sel-display'); if(!el)return;
  if(!ordS.items.length){el.textContent='(선택 없음)';return;}
  el.textContent=ordS.items.map(id=>ordActiveMenu.find(m=>m.id===id)?.name).filter(Boolean).join(', ');
}
function ordCloseMenu(){
  const modal=document.getElementById('ord-menu-modal'); if(modal)modal.style.display='none';
  ordS.seat=null; ordS.items=[];
}

function ordSubmitOrder(){
  if(!ordS.items.length){ordToast('메뉴를 선택해주세요.','error');return;}
  const isNumMode=DB.orderLimitMode()==='num';
  const maxG=isNumMode?DB.orderMaxGlassesPerNum():DB.orderMaxGlasses();
  const used=isNumMode?ordNumGlassCount(ordS.gender,ordS.num):ordSeatGlassCount(ordS.seat);
  const rem=maxG-used;
  if(ordS.items.length>rem){
    ordToast(isNumMode?`이 번호는 ${rem}잔만 더 주문 가능합니다.`:`이 좌석은 ${rem}잔만 더 주문 가능합니다.`,'error');return;
  }
  const order={
    id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    gender:ordS.gender, datingNumber:ordS.num, seatNumber:ordS.seat,
    items:[...ordS.items], status:'pending', orderedAt:Date.now()
  };
  const orders=DB.orderOrders(); orders.push(order); DB.saveOrderOrders(orders);
  const modal=document.getElementById('ord-menu-modal'); if(modal)modal.style.display='none';
  ordShowPending(order);
  ordToast('주문이 접수되었습니다!','success');
  // 좌석 모드에서만 좌석 자동 비활성화
  if(!isNumMode&&used+ordS.items.length>=maxG){
    const seats=ordGetActiveSeats().filter(s=>s!==ordS.seat);
    DB.set('order_active_seats',seats);
  }
}

function ordShowPending(o){
  ['ord-step0','ord-step1','ord-step2'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
  const pending=document.getElementById('ord-pending'); if(pending)pending.style.display='';
  const names=o.items.map(id=>ordActiveMenu.find(m=>m.id===id)?.name).filter(Boolean).join(', ');
  const info=document.getElementById('ord-pending-info');
  if(info)info.innerHTML=`<strong style="color:var(--txt);">${o.gender}자 ${o.datingNumber}번</strong>&nbsp;·&nbsp;좌석 <strong style="color:var(--txt);">${o.seatNumber}번</strong><br><span style="color:var(--gold);font-size:15px;">${names}</span>`;
}

// ═══════════════════════════════════════════════════
// Start
initSB();
checkExpiredFiles();
if(_sb){
  loadFromSB().then(()=>{
    history.replaceState({page:'main',params:{}},'','#main');
    go('main',{},false);
  });
} else {
  history.replaceState({page:'main',params:{}},'','#main');
  go('main',{},false);
}
