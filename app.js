// ====== 定義常數與工具函式 ======
// COLORS: 定義不同圖表及圓餅圖的配色
// TAB_RHO: 極耳材料的密度 (g/cm³)
// clamp: 將值限制在指定的範圍內
// num: 將輸入字串轉為數值並去除逗號
// fmt: 將數值格式化為固定小數位的字串
// 單位轉換函式: mm、mm²、µm 轉為 cm 相關單位
const COLORS=["#2563eb","#16a34a","#f59e0b","#ef4444","#7c3aed","#0891b2","#065f46","#b91c1c","#78350f","#334155","#64748b"];
const TAB_RHO={Al:2.70,Cu:8.96,Ni:8.90};
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const num=(v)=>{const n=parseFloat(String(v).replace(/,/g,""));return isFinite(n)?n:0};
const fmt=(v,d=2)=>isFinite(v)?Number(v).toFixed(d):"";
const mm_to_cm=(mm)=>mm/10, mm2_to_cm2=(mm2)=>mm2/100, um_to_cm=(um)=>um/10000;

// 確保每個設計都有名稱，若未指定則自動以 design1, design2 命名
function ensureDesignNames() {
  designs = designs.map((d,i)=> ({...d, design_name: d.design_name || ("design"+(i+1))}));
}


// 根據外殼參數自動計算建議高度 H_auto
function H_auto(d){return 2*num(d.shell_mm)+num(d.top_intr_mm)+num(d.bot_intr_mm)+num(d.crimp_mm)+Math.max(num(d.C_width_mm),num(d.A_width_mm));}
// 比較使用者輸入高度與自動計算高度，若不足則提示警告
function warnH(d){return d.H_input_mm<H_auto(d)?"H 小於自動計算值，請確認":"";}
// 計算電池外殼(罐體)質量，根據體積與密度
function canMass_g(d){const vmm3=Math.PI*(Math.pow(d.D_mm/2,2)-Math.pow(d.D_mm/2-d.shell_mm,2))*d.H_input_mm;return vmm3/1000*num(d.can_rho_gcc);}
// 由面密度、材料密度與孔隙率計算單層厚度 (µm)
function layerThickness_um_from_areal(m,rho,por){const t=(num(m)/1000)/num(rho)/(1-clamp(num(por)/100,0,0.99));return t*1e4;}
const swell=(um,s)=>um*(1+num(s)/100);
function AC_ratio(d){const n=num(d.m_areal_A_mgcm2)*(num(d.active_A_pct)/100)*num(d.theo_A_mAhg);const de=num(d.m_areal_C_mgcm2)*(num(d.active_C_pct)/100)*num(d.theo_C_mAhg);return de>0?n/de:0;}

function buildRadiusAndSegments(d,t,g_mm){
  let r = num(d.core_mm)/2;
  const segs = [];
  const tS1 = t.tS1_um/1000, tS2 = t.tS2_um/1000;
  const tC  = (t.tC_tot_um!==undefined?t.tC_tot_um:t.tC_um)/1000;
  const tA  = (t.tA_tot_um!==undefined?t.tA_tot_um:t.tA_um)/1000;
  const d12   = ()=> tS1 + tS2 + 1*g_mm;
  const d1A2  = ()=> tS1 + tA + tS2 + 2*g_mm;
  const d1A2C = ()=> tS1 + tA + tS2 + tC + 3*g_mm;
  const push = (count,p,thick)=>{ const n = Math.max(0, Math.floor(num(count))); for(let i=0;i<n;i++){ segs.push({present:p, r_mm:r}); r += thick(); } };
  push(d.n1, {S1:1,S2:0,A:0,C:0}, ()=> tS1);
  push(d.n2, {S1:1,S2:1,A:0,C:0}, d12);
  push(d.n3, {S1:1,S2:1,A:1,C:0}, d1A2);
  const rmax = num(d.D_mm)/2 - num(d.shell_mm);
  const reserve = Math.max(0, Math.floor(num(d.n5))) * d1A2() + Math.max(0, Math.floor(num(d.n6))) * d12();
  const available = Math.max(0, rmax - r - reserve);
  const n4 = Math.max(0, Math.floor( available / d1A2C() ));
  push(n4,  {S1:1,S2:1,A:1,C:1}, d1A2C);
  push(d.n5,{S1:1,S2:1,A:1,C:0}, d1A2);
  push(d.n6,{S1:1,S2:1,A:0,C:0}, d12);
  return {segs, n4};
}

function stripLengths_mm(d,segs){
  let L={S1:0,C:0,S2:0,A:0};
  let Aif_total_mm2 = 0;
  const wC = effWidth(d.C_width_mm,d.top_margin_mm,d.bot_margin_mm);
  const wA = effWidth(d.A_width_mm,d.top_margin_mm,d.bot_margin_mm);
  const wS1= effWidth(d.S1_width_mm,d.top_margin_mm,d.bot_margin_mm);
  const wS2= effWidth(d.S2_width_mm,d.top_margin_mm,d.bot_margin_mm);
  for(const s of segs){
    const circ = 2*Math.PI*s.r_mm;
    if(s.present.S1) L.S1 += circ;
    if(s.present.C)  L.C  += circ;
    if(s.present.S2) L.S2 += circ;
    if(s.present.A)  L.A  += circ;
    let iface=0, w_eff=0;
    if(s.present.S1 && s.present.S2 && !s.present.A && !s.present.C){ iface=1; w_eff=Math.min(wS1,wS2); }
    if(s.present.S1 && s.present.A && s.present.S2 && !s.present.C){ iface=2; w_eff=Math.min(wS1,wA,wS2); }
    if(s.present.S1 && s.present.A && s.present.S2 && s.present.C){ iface=3; w_eff=Math.min(wS1,wA,wS2,wC); }
    Aif_total_mm2 += iface * circ * Math.max(0,w_eff);
  }
  const f=1-clamp(num(d.tab_window_pct)/100,0,0.99);
  return {L_S1:L.S1*f, L_C:L.C*f, L_S2:L.S2*f, L_A:L.A*f, A_if_mm2: Aif_total_mm2*f};
}

function effWidth(width,top,bottom){return Math.max(0,num(width)-num(top)-num(bottom));}
function cathodeArea_cm2(d,Lc){return mm2_to_cm2(Math.max(0,Lc*effWidth(d.C_width_mm,d.top_margin_mm,d.bot_margin_mm)));}
function anodeArea_cm2(d,La){return mm2_to_cm2(Math.max(0,La*effWidth(d.A_width_mm,d.top_margin_mm,d.bot_margin_mm)));}
function s1Area_cm2(d,Ls1){return mm2_to_cm2(Math.max(0,Ls1*effWidth(d.S1_width_mm,d.top_margin_mm,d.bot_margin_mm)));}
function s2Area_cm2(d,Ls2){return mm2_to_cm2(Math.max(0,Ls2*effWidth(d.S2_width_mm,d.top_margin_mm,d.bot_margin_mm)));}
function capacity_Ah(d,areaC){const Qa=(num(d.m_areal_C_mgcm2)/1000)*(num(d.active_C_pct)/100)*num(d.theo_C_mAhg);return (Qa*areaC)/1000;}
const externalVolume_L=(d)=>Math.PI*Math.pow(num(d.D_mm)/2,2)*num(d.H_input_mm)*1e-6;
const coreVolume_L=(d)=>{const dcore=Math.max(num(d.D_mm)-2*num(d.shell_mm),0);return Math.PI*Math.pow(dcore/2,2)*num(d.H_input_mm)*1e-6;};
function massTabs_g(L,W,T,rho,qty){return (mm_to_cm(L)*mm_to_cm(W)*mm_to_cm(T))*rho*qty;}
function massCollectors_g(d,Ls){const tC=um_to_cm(num(d.foil_C_um)),tA=um_to_cm(num(d.foil_A_um));const areaC=cathodeArea_cm2(d,Ls.L_C), areaA=anodeArea_cm2(d,Ls.L_A);return {m_collector_C_g:areaC*tC*2.70,m_collector_A_g:areaA*tA*8.96};}
function massActives_g(d,areaC,Ls){const areaA=anodeArea_cm2(d,Ls.L_A);return {m_active_C_g:(num(d.m_areal_C_mgcm2)/1000)*areaC, m_active_A_g:(num(d.m_areal_A_mgcm2)/1000)*areaA};}
function sepThickness_um(d,key){const m=key==="S1"?d.m_areal_S1_mgcm2:d.m_areal_S2_mgcm2;const rho=key==="S1"?d.rho_S1_gcc:d.rho_S2_gcc;const por=key==="S1"?d.por_S1_pct:d.por_S2_pct;return layerThickness_um_from_areal(m,rho,por);}
function massSeparators_g(d,Ls){const areaS1=s1Area_cm2(d,Ls.L_S1), areaS2=s2Area_cm2(d,Ls.L_S2);const tS1=um_to_cm(sepThickness_um(d,"S1")), tS2=um_to_cm(sepThickness_um(d,"S2"));return {m_S1_g:areaS1*tS1*num(d.rho_S1_gcc)*(1-num(d.por_S1_pct)/100), m_S2_g:areaS2*tS2*num(d.rho_S2_gcc)*(1-num(d.por_S2_pct)/100)};}
function energyWh(capAh,V){return capAh*V} function whPerL(E,Vl){return Vl>0?E/Vl:0} function whPerKg(E,m){return m>0?E/(m/1000):0}

let designs=[];
const blankDesign=(i=0)=>({
  id: Date.now()+"-"+i, name: "Design "+(i+1),
  D_mm:46, core_mm:6.1, shell_mm:0.5, top_intr_mm:0.6, bot_intr_mm:2, crimp_mm:2,
  C_width_mm:72, A_width_mm:73, S1_width_mm:79, S2_width_mm:79,
  top_margin_mm:1, bot_margin_mm:1, tab_window_pct:5,
  H_input_mm:80,
  n1:3,n2:5,n3:2,n5:1,n6:1,
  V_work:3.7,
  m_areal_C_mgcm2:53.4, active_C_pct:98, theo_C_mAhg:210, rho_C_gcc:4.4, por_C_pct:21.7, swell_C_pct:0,
  m_areal_A_mgcm2:36.8, active_A_pct:98, theo_A_mAhg:345, rho_A_gcc:2.1, por_A_pct:33.1, swell_A_pct:0,
  m_areal_S1_mgcm2:1.41, rho_S1_gcc:0.94, por_S1_pct:0,
  m_areal_S2_mgcm2:1.41, rho_S2_gcc:0.94, por_S2_pct:0,
  elyteFill_pct:100, elyteRho_gcc:1.2,
  tab_c_mat:"Al", tab_c_L_mm:2446, tab_c_W_mm:6.5, tab_c_T_mm:0.13, tab_c_qty:1,
  tab_a_mat:"Cu", tab_a_L_mm:2548, tab_a_W_mm:7.5, tab_a_T_mm:0.09, tab_a_qty:1,
  can_rho_gcc:7.9,
  foil_C_um:13, foil_A_um:9,
  elyte_overfill_pct: 0, m_comp_top_g: 8.7, m_comp_bottom_g: 0, m_comp_insul_g: 1.4, m_comp_terminal_g: 2.3, m_comp_others_g: 23.22
});
designs=[blankDesign(0)];
let activeId=designs[0].id;
let step1={}, step2={};
function el(tag,props={},children=[]){const e=document.createElement(tag);Object.assign(e,props);children.forEach(c=>e.append(c));return e;}
function field(labelText,inputEl){const w=el("div");w.append(el("label",{innerText:labelText}),inputEl);return w;}
// Modify numeric input to accept decimals and avoid re-render on every keystroke.
// Use type="number" with step="any" and update on change event.
function numInput(v,on){
  const i=el("input",{type:"number",step:"any",value:v});
  // Update bound value when input loses focus or user presses enter
  i.addEventListener("change",()=>{
    on(num(i.value));
  });
  return i;
}
function selInput(v,on){const s=el("select");["Al","Cu","Ni"].forEach(k=>{const o=el("option",{value:k,innerText:k});if(k===v)o.selected=true;s.append(o)});s.addEventListener("change",()=>on(s.value));return s;}
function renderTabs(){
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = "";

  designs.forEach(d => {
    const name = (d.design_name || d.name);

    // 分頁按鈕：正常顯示與切換
    const btn = el("button", {
      className: "tab" + (d.id === activeId ? " active" : ""),
      innerText: name
    });
    btn.onclick = () => { activeId = d.id; render(); };

    // 雙擊啟動「就地改名」編輯
    btn.ondblclick = (e) => {
      e.stopPropagation();
      startInlineEdit(btn, d, name);
    };

    tabs.append(btn);
  });
}

// 就地編輯：把按鈕換成同寬的 input，Enter/Blur 儲存，Esc 取消
function startInlineEdit(btn, designObj, current){
  const input = el("input", {
    className: btn.className + " tab-edit",
    value: current
  });

  // 讓輸入框寬度接近原按鈕
  const rect = btn.getBoundingClientRect();
  input.style.width = Math.max(90, Math.floor(rect.width)) + "px";

  const commit = () => {
    const v = String(input.value || "").trim();
    if (v) designObj.design_name = v;
    renderTabs(); // 只重繪 tabs，不整頁重繪，避免捲動跳動
  };
  const cancel = () => { renderTabs(); };

  input.onkeydown = (ev) => {
    if (ev.key === "Enter") commit();
    if (ev.key === "Escape") cancel();
  };
  input.onblur = commit;

  btn.replaceWith(input);
  input.focus();
  input.select();
}
function addDesign(){if(designs.length>=6)return;const d=blankDesign(designs.length);designs.push(d);ensureDesignNames();activeId=d.id;render();}
function removeActive(){designs=designs.filter(d=>d.id!==activeId);if(designs.length===0){designs=[blankDesign(0)];}activeId=designs[0].id;render();}
// 計算 Step1：根據材料參數計算各層厚度以及 A/C 比
function computeStep1(d) {
  const tS1_um = layerThickness_um_from_areal(d.m_areal_S1_mgcm2, d.rho_S1_gcc, d.por_S1_pct);
  const tS2_um = layerThickness_um_from_areal(d.m_areal_S2_mgcm2, d.rho_S2_gcc, d.por_S2_pct);
  // Cathode active layer thickness (swelled) in µm
  const tC_act_um = swell(layerThickness_um_from_areal(d.m_areal_C_mgcm2, d.rho_C_gcc, d.por_C_pct), d.swell_C_pct);
  // Anode active layer thickness (swelled) in µm
  const tA_act_um = swell(layerThickness_um_from_areal(d.m_areal_A_mgcm2, d.rho_A_gcc, d.por_A_pct), d.swell_A_pct);
  // Total physical thickness includes the foil/metal layers.
  const tC_tot_um = tC_act_um + num(d.foil_C_um || 0);
  const tA_tot_um = tA_act_um + num(d.foil_A_um || 0);
  const ac = AC_ratio(d);
  // Store both active thickness (for pore volume/mass calculations) and total thickness (for geometry).
  step1[d.id] = {
    tS1_um,
    tS2_um,
    tC_um: tC_act_um,
    tA_um: tA_act_um,
    tC_tot_um,
    tA_tot_um,
    ac
  };
}
// 計算 Step2：建立捲繞結構、計算帶長、容量、能量密度與質量分佈
function computeStep2(d){
  const t = step1[d.id] || (computeStep1(d), step1[d.id]);
  // pass 1: g=0
  let built = buildRadiusAndSegments(d,t,0);
  let Ls    = stripLengths_mm(d,built.segs);
  let areaC = cathodeArea_cm2(d,Ls.L_C), areaA = anodeArea_cm2(d,Ls.L_A);
  let areaS1= s1Area_cm2(d,Ls.L_S1), areaS2 = s2Area_cm2(d,Ls.L_S2);

  const Vpore =
    areaC*um_to_cm(t.tC_um)*clamp(num(d.por_C_pct)/100,0,0.99) +
    areaA*um_to_cm(t.tA_um)*clamp(num(d.por_A_pct)/100,0,0.99) +
    areaS1*um_to_cm(t.tS1_um)*clamp(num(d.por_S1_pct)/100,0,0.99) +
    areaS2*um_to_cm(t.tS2_um)*clamp(num(d.por_S2_pct)/100,0,0.99);
  const fillFrac = clamp(num(d.elyteFill_pct)/100,0,1);
  const overPct  = Math.max(0, num(d.elyte_overfill_pct)/100);
  const Velyte   = Vpore*fillFrac + Vpore*overPct;
  const Vover    = Math.max(0, Velyte - Vpore*fillFrac);
  const Aif_mm2  = Math.max(1e-12, Ls.A_if_mm2);
  const g_mm = (Vover*1000) / Aif_mm2;

  // pass 2: with g
  built = buildRadiusAndSegments(d,t,g_mm);
  Ls    = stripLengths_mm(d,built.segs);
  areaC = cathodeArea_cm2(d,Ls.L_C); areaA = anodeArea_cm2(d,Ls.L_A);
  areaS1= s1Area_cm2(d,Ls.L_S1);     areaS2 = s2Area_cm2(d,Ls.L_S2);

  const capAh = capacity_Ah(d,areaC), EWh = energyWh(capAh, d.V_work);
  const Vext = externalVolume_L(d), Vcore = coreVolume_L(d);
  const mTabs = { m_tab_c_g: massTabs_g(d.tab_c_L_mm,d.tab_c_W_mm,d.tab_c_T_mm,TAB_RHO[d.tab_c_mat],d.tab_c_qty),
                  m_tab_a_g: massTabs_g(d.tab_a_L_mm,d.tab_a_W_mm,d.tab_a_T_mm,TAB_RHO[d.tab_a_mat],d.tab_a_qty) };
  const mCols = massCollectors_g(d,Ls);
  const mActs = massActives_g(d,areaC,Ls);
  const mSeps = massSeparators_g(d,Ls);
  const mCan  = canMass_g(d);
  const mEly  = num(d.elyteRho_gcc) * (Vpore*fillFrac + Vover);
  const mComponents = num(d.m_comp_top_g)+num(d.m_comp_bottom_g)+num(d.m_comp_insul_g)+num(d.m_comp_terminal_g)+num(d.m_comp_others_g);

  const mass_core  = mActs.m_active_C_g + mActs.m_active_A_g + mCols.m_collector_C_g + mCols.m_collector_A_g +
                     mSeps.m_S1_g + mSeps.m_S2_g + mEly + mTabs.m_tab_c_g + mTabs.m_tab_a_g + mComponents;
  const mass_total = mass_core + mCan;

  const n1 = Math.max(0, Math.floor(num(d.n1)));
  const n2 = Math.max(0, Math.floor(num(d.n2)));
  const n3 = Math.max(0, Math.floor(num(d.n3)));
  const n5 = Math.max(0, Math.floor(num(d.n5)));
  const n6 = Math.max(0, Math.floor(num(d.n6)));
  const turns = n1 + n2 + n3 + Math.max(0, built.n4) + n5 + n6;

  step2[d.id] = {
    n4: built.n4,
    turns,
    g_mm,
    Ls, capAh, EWh, Vext, Vcore,
    WhL_ext: whPerL(EWh,Vext),
    Whkg_ext: whPerKg(EWh,mass_total),
    WhL_core: whPerL(EWh,Vcore),
    Whkg_core: whPerKg(EWh,mass_core),
    m: { ...mTabs, ...mCols, ...mActs, ...mSeps, m_can_g: mCan, m_elyte_g: mEly, m_components_g: mComponents }
  };
}


// 設計區塊：幾何與邊界參數輸入，例如外徑 D、殼厚、預留高度等
function sectionGeometry(d){const w=el("div",{className:"card"}); w.append(el("div",{className:"title",innerText:"1️⃣ 幾何與邊界"}));
  const g=el("div",{className:"grid4"}); const bind=(k)=>(v)=>{d[k]=v;};
  g.append(field("D (mm)",numInput(d.D_mm,bind("D_mm"))));
  g.append(field("Core diameter (mm)",numInput(d.core_mm,bind("core_mm"))));
  g.append(field("Shell thickness (mm)",numInput(d.shell_mm,bind("shell_mm"))));
  g.append(field("H (mm)",numInput(d.H_input_mm,bind("H_input_mm"))));
  g.append(field("Top intrusion (mm)",numInput(d.top_intr_mm,bind("top_intr_mm"))));
  g.append(field("Bottom intrusion (mm)",numInput(d.bot_intr_mm,bind("bot_intr_mm"))));
  g.append(field("Crimp (mm)",numInput(d.crimp_mm,bind("crimp_mm"))));
  const ha=el("input",{type:"text",value:fmt(H_auto(d),3),disabled:true}); 
  g.append(field("H_auto_calc (mm)",ha));
  w.append(g, el("div",{className:"warn",innerText:warnH(d)}));
  
  const g2=el("div",{className:"grid5"});
  w.append(el("div",{className:"subtitle",innerText:"Component weights (g)"}));
  const bind2=(k)=>(v)=>{d[k]=v;};
  g2.append(field("Top cap (g)",numInput(d.m_comp_top_g,bind2("m_comp_top_g"))));
  g2.append(field("Bottom cap (g)",numInput(d.m_comp_bottom_g,bind2("m_comp_bottom_g"))));
  g2.append(field("Insulator (g)",numInput(d.m_comp_insul_g,bind2("m_comp_insul_g"))));
  g2.append(field("Terminal (g)",numInput(d.m_comp_terminal_g,bind2("m_comp_terminal_g"))));
  g2.append(field("Others (g)",numInput(d.m_comp_others_g,bind2("m_comp_others_g"))));
  w.append(g2); return w;}

function sectionBands(d){const w=el("div",{className:"card"}); w.append(el("div",{className:"title",innerText:"2️⃣ 帶寬與帶長"}));
  const g=el("div",{className:"grid4"}); const bind=(k)=>(v)=>{d[k]=v;};
  g.append(field("C width (mm)",numInput(d.C_width_mm,bind("C_width_mm"))));
  g.append(field("A width (mm)",numInput(d.A_width_mm,bind("A_width_mm"))));
  g.append(field("S1 width (mm)",numInput(d.S1_width_mm,bind("S1_width_mm"))));
  g.append(field("S2 width (mm)",numInput(d.S2_width_mm,bind("S2_width_mm"))));
  g.append(field("Top margin (mm)",numInput(d.top_margin_mm,bind("top_margin_mm"))));
  g.append(field("Bottom margin (mm)",numInput(d.bot_margin_mm,bind("bot_margin_mm"))));
  g.append(field("Tab window (%)",numInput(d.tab_window_pct,bind("tab_window_pct"))));
  w.append(g); return w;}
// 設計區塊：設定捲繞結構層數 n1~n6
function sectionWinding(d){const w=el("div",{className:"card"}); w.append(el("div",{className:"title",innerText:"3️⃣ 結構圈數設定"}));
  const g=el("div",{className:"grid6"}); const bind=(k)=>(v)=>{d[k]=v;};
  g.append(field("n1 (S1)",numInput(d.n1,bind("n1"))));
  g.append(field("n2 (S1+S2)",numInput(d.n2,bind("n2"))));
  g.append(field("n3 (S1+A+S2)",numInput(d.n3,bind("n3"))));
  const n4=el("input",{type:"text",disabled:true}); n4.value=step2[d.id]?.n4??""; g.append(field("n4 (AUTO)",n4));
  g.append(field("n5 (S1+A+S2)",numInput(d.n5,bind("n5"))));
  g.append(field("n6 (S1+S2)",numInput(d.n6,bind("n6"))));
  w.append(g,el("div",{className:"small",innerText:"定義：n1=S1；n2=S1+S2；n3=S1+A+S2；n4=S1+A+S2+C；n5=S1+A+S2；n6=S1+S2"})); return w;}

// 設計區塊：材料與厚度模型輸入，包括電壓、正極、負極、隔膜與電解液參數
function sectionMaterials(d){
  const w=el("div",{className:"card"});
  w.append(el("div",{className:"title",innerText:"4️⃣ 材料與厚度模型"}));
  const bind=(k)=>(v)=>{d[k]=v;};

  // ── Working voltage ──
  const gV = el("div",{className:"grid1"});
  gV.append(field("Working voltage (V)", numInput(d.V_work, v=>{ d.V_work=v; })));
  w.append(gV);

  // ── Cathode (C) ──
  const gC = el("div",{className:"grid6"});
  gC.append(
    field("m_areal_C (mg/cm²)", numInput(d.m_areal_C_mgcm2,bind("m_areal_C_mgcm2"))),
    field("ρ_solid_C (g/cm³)", numInput(d.rho_C_gcc,bind("rho_C_gcc"))),
    field("active_C (%)", numInput(d.active_C_pct,bind("active_C_pct"))),
    field("theoCap_C (mAh/g)", numInput(d.theo_C_mAhg,bind("theo_C_mAhg"))),
    field("porosity_C (%)", numInput(d.por_C_pct,bind("por_C_pct"))),
    field("swell_C (%)", numInput(d.swell_C_pct,bind("swell_C_pct")))
  );
  w.append(el("div",{className:"subtitle",innerText:"Cathode"}), gC);

  // ── Anode (A) ──
  const gA = el("div",{className:"grid6"});
  gA.append(
    field("m_areal_A (mg/cm²)", numInput(d.m_areal_A_mgcm2,bind("m_areal_A_mgcm2"))),
    field("ρ_solid_A (g/cm³)", numInput(d.rho_A_gcc,bind("rho_A_gcc"))),
    field("active_A (%)", numInput(d.active_A_pct,bind("active_A_pct"))),
    field("theoCap_A (mAh/g)", numInput(d.theo_A_mAhg,bind("theo_A_mAhg"))),
    field("porosity_A (%)", numInput(d.por_A_pct,bind("por_A_pct"))),
    field("swell_A (%)", numInput(d.swell_A_pct,bind("swell_A_pct")))
  );
  w.append(el("div",{className:"subtitle",innerText:"Anode"}), gA);

  // ── Separator 1 & 2 ──
  const gS = el("div",{className:"grid3"});
  gS.append(
    field("m_areal_S1 (mg/cm²)", numInput(d.m_areal_S1_mgcm2,bind("m_areal_S1_mgcm2"))),
    field("ρ_solid_S1 (g/cm³)", numInput(d.rho_S1_gcc,bind("rho_S1_gcc"))),
    field("porosity_S1 (%)", numInput(d.por_S1_pct,bind("por_S1_pct"))),
    field("m_areal_S2 (mg/cm²)", numInput(d.m_areal_S2_mgcm2,bind("m_areal_S2_mgcm2"))),
    field("ρ_solid_S2 (g/cm³)", numInput(d.rho_S2_gcc,bind("rho_S2_gcc"))),
    field("porosity_S2 (%)", numInput(d.por_S2_pct,bind("por_S2_pct")))
  );
  w.append(el("div",{className:"subtitle",innerText:"Separator 1 & 2"}), gS);

  // ── Electrolyte ──
  const gE = el("div",{className:"grid3"});
  gE.append(
    field("elyte ρ (g/cm³)", numInput(d.elyteRho_gcc,bind("elyteRho_gcc"))),
    field("elyteFill (%)", numInput(d.elyteFill_pct,bind("elyteFill_pct"))),
    field("elyte overfill (% of pore)", numInput(d.elyte_overfill_pct,bind("elyte_overfill_pct")))
  );
  w.append(el("div",{className:"subtitle",innerText:"Electrolyte"}), gE);

  return w;
}

function sectionTabsCan(d){const w=el("div",{className:"card"}); w.append(el("div",{className:"title",innerText:"5️⃣ Tab 與 Can"}));
  const g=el("div",{className:"grid6"}); const bind=(k)=>(v)=>{d[k]=v;};
  g.append(field("Tab_C 材質",selInput(d.tab_c_mat,v=>{d.tab_c_mat=v;render();})));
  const tcd=numInput(TAB_RHO[d.tab_c_mat],()=>{}); tcd.disabled=true; g.append(field("Tab_C 密度 (g/cm³)",tcd));
  g.append(field("Tab_C 長 (mm)",numInput(d.tab_c_L_mm,bind("tab_c_L_mm"))));
  g.append(field("Tab_C 寬 (mm)",numInput(d.tab_c_W_mm,bind("tab_c_W_mm"))));
  g.append(field("Tab_C 厚 (mm)",numInput(d.tab_c_T_mm,bind("tab_c_T_mm"))));
  g.append(field("Tab_C 數量",numInput(d.tab_c_qty,bind("tab_c_qty"))));
  g.append(field("Tab_A 材質",selInput(d.tab_a_mat,v=>{d.tab_a_mat=v;render();})));
  const tad=numInput(TAB_RHO[d.tab_a_mat],()=>{}); tad.disabled=true; g.append(field("Tab_A 密度 (g/cm³)",tad));
  g.append(field("Tab_A 長 (mm)",numInput(d.tab_a_L_mm,bind("tab_a_L_mm"))));
  g.append(field("Tab_A 寬 (mm)",numInput(d.tab_a_W_mm,bind("tab_a_W_mm"))));
  g.append(field("Tab_A 厚 (mm)",numInput(d.tab_a_T_mm,bind("tab_a_T_mm"))));
  g.append(field("Tab_A 數量",numInput(d.tab_a_qty,bind("tab_a_qty"))));
  g.append(field("Can 密度 (g/cm³)",numInput(d.can_rho_gcc,bind("can_rho_gcc"))));
  g.append(field("Cathode foil 厚 (µm)",numInput(d.foil_C_um,bind("foil_C_um"))));
  g.append(field("Anode foil 厚 (µm)",numInput(d.foil_A_um,bind("foil_A_um"))));
  w.append(g); return w;}
// === 按鈕 1：計算各層厚度與 A/C 比 ===
// 此區塊顯示計算按鈕與輸出 t_S1, t_C, t_S2, t_A 以及 A/C ratio
function sectionStep1(d){
  const w = el("div",{className:"card"});
  w.append(el("div",{className:"title",innerText:"Thickness Calculation"})); // 去掉「按鈕 1」文字
  // 不再建立 toolbar 與按鈕
  const t = step1[d.id];
  const grid = el("div",{className:"grid5"});
  grid.append(field("t_S1 (µm)", el("input",{type:"text",value:t?fmt(t.tS1_um,2):"",disabled:true})));
  grid.append(field("t_C (µm)",  el("input",{type:"text",value:t?fmt(t.tC_um,2):"",disabled:true})));
  grid.append(field("t_S2 (µm)", el("input",{type:"text",value:t?fmt(t.tS2_um,2):"",disabled:true})));
  grid.append(field("t_A (µm)",  el("input",{type:"text",value:t?fmt(t.tA_um,2):"",disabled:true})));
  grid.append(field("A/C ratio", el("input",{type:"text",value:t?fmt(t.ac,3):"",disabled:true})));
  w.append(grid, el("div",{className:"warn",innerText:warnH(d)}));
  return w;
}



function drawPie(data){
  const total=data.reduce((s,d)=>s+d.value,0)||1; 
  const w = 420;              // 畫布加寬
  const h = 260;
  const cx = 270;             // 圓心往右移
  const cy = h / 2;
  const r = 110;               // 半徑略縮，避免貼邊
  let a0 = 0;
  const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("class", "svgbox");
  data.forEach(d=>{const a1=a0+d.value/total*2*Math.PI; const x0=cx+r*Math.cos(a0), y0=cy+r*Math.sin(a0); const x1=cx+r*Math.cos(a1), y1=cy+r*Math.sin(a1);
    const large=(a1-a0)>Math.PI?1:0; const path=document.createElementNS("http://www.w3.org/2000/svg","path"); path.setAttribute("d",`M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`); path.setAttribute("fill",d.color); svg.append(path);
    // Omit slice labels for a cleaner pie chart. Only draw colored segments.
    a0=a1; });
  let ly=15; 
  data.forEach(d=>{
    const g=document.createElementNS("http://www.w3.org/2000/svg","g"); 
    const rect=document.createElementNS("http://www.w3.org/2000/svg","rect"); 
    rect.setAttribute("x",10);
    rect.setAttribute("y",ly);
    rect.setAttribute("width",10);
    rect.setAttribute("height",10);
    rect.setAttribute("fill",d.color);
    const text=document.createElementNS("http://www.w3.org/2000/svg","text"); 
    text.setAttribute("x",25);text.setAttribute("y",ly+9);
    text.setAttribute("font-size","16"); 
    text.textContent=d.name; 
    g.append(rect,text); 
    svg.append(g); ly+=22; }); 
    return svg;
  }

function drawScatter() {
  const svg = document.getElementById("scatter");
  if (!svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const pts = designs
    .map((d, i) => {
      const r = step2[d.id];
      if (!r || !isFinite(r.WhL_ext) || !isFinite(r.Whkg_ext)) return null;
      return {
        name: (d.design_name||d.name),
        x: r.WhL_ext,
        y: r.Whkg_ext,
        cap: r.capAh > 0 ? r.capAh : 1,
        color: COLORS[i % COLORS.length],
      };
    })
    .filter(Boolean);

  if (pts.length === 0) return;

  const pad = 60;
  const W = 800, H = 360;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y), caps = pts.map(p => p.cap);
  const xmin = 0, xmax = 900;
  const ymin = 0, ymax = 450;
  const capMin = Math.min(...caps), capMax = Math.max(...caps);
  const rMin = 4, rMax = 12;
  const scaleCap = c => rMin + ((c - capMin) / (capMax - capMin || 1)) * (rMax - rMin);

  const sx = x => pad + (x - xmin) / (xmax - xmin || 1) * (W - 2 * pad);
  const sy = y => H - pad - (y - ymin) / (ymax - ymin || 1) * (H - 2 * pad);

  const mk = (tag, attrs) => {
    const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    return e;
  };

  svg.append(mk("rect", { x: 0, y: 0, width: W, height: H, fill: "#fff" }));
  // axis lines
  svg.append(mk("line", { x1: pad, y1: pad, x2: pad, y2: H - pad, stroke: "#94a3b8" }));
  svg.append(mk("line", { x1: pad, y1: H - pad, x2: W - pad, y2: H - pad, stroke: "#94a3b8" }));

  const numTicks = 5;
  for (let i = 0; i <= numTicks; i++) {
    const tx = xmin + (xmax - xmin) * i / numTicks;
    const xPos = sx(tx);
    svg.append(mk("line", { x1: xPos, y1: H - pad, x2: xPos, y2: H - pad + 4, stroke: "#94a3b8" }));
    const labelX = mk("text", { x: xPos, y: H - pad + 18, "font-size": "12", "text-anchor": "middle" });
    labelX.textContent = tx.toFixed(0); // 0 decimals
    svg.append(labelX);

    const ty = ymin + (ymax - ymin) * i / numTicks;
    const yPos = sy(ty);
    svg.append(mk("line", { x1: pad - 4, y1: yPos, x2: pad, y2: yPos, stroke: "#94a3b8" }));
    const labelY = mk("text", { x: pad - 8, y: yPos + 4, "font-size": "12", "text-anchor": "end" });
    labelY.textContent = ty.toFixed(0); // 0 decimals
    svg.append(labelY);
  }

  const xLabel = mk("text", { x: (pad + (W - pad)) / 2, y: H - 20, "font-size": "14", "text-anchor": "middle" });
  xLabel.textContent = "Wh/L(ext)";
  svg.append(xLabel);

  const yLabelY = (pad + (H - pad)) / 2;
  const yLabel = mk("text", { x: 16, y: yLabelY, "font-size": "14", "text-anchor": "middle", transform: "rotate(-90 16 " + yLabelY + ")" });
  yLabel.textContent = "Wh/kg(ext)";
  svg.append(yLabel);

  // plot points
  pts.forEach(p => {
    const cx = sx(p.x), cy = sy(p.y);
    const rad = scaleCap(p.cap);
    svg.append(mk("circle", { cx, cy, r: rad, fill: p.color, opacity: "0.8" }));
  });

  // legend
  const legendX = W - pad + 10, legendY0 = pad;
  pts.forEach((p, i) => {
    const y = legendY0 + i * 18;
    svg.append(mk("rect", { x: legendX, y: y - 8, width: 12, height: 12, fill: p.color }));
    const t = mk("text", { x: legendX + 18, y: y + 2, "font-size": "12", "text-anchor": "start" });
    t.textContent = p.name;
    svg.append(t);
  });
}

function render(){renderTabs(); const root=document.getElementById("app"); root.innerHTML=""; const d=designs.find(x=>x.id===activeId);
  root.append(sectionGeometry(d),sectionBands(d),sectionWinding(d),sectionMaterials(d),sectionTabsCan(d),sectionStep1(d),sectionStep2(d));
  const summ=renderSummaryAll(); root.append(summ); drawScatter();}
function exportJSON(){const blob=new Blob([JSON.stringify(designs,null,2)],{type:"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="cylindrical_v10_3_state.json"; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),500);}
function exportCSV(){const keys=Object.keys(designs[0]||{}); const lines=[keys.join(",")]; designs.forEach(d=>lines.push(keys.map(k=>d[k]).join(","))); const blob=new Blob([lines.join("\n")],{type:"text/csv"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="cylindrical_v10_3_state.csv"; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),500);}
function importFile(file){const fr=new FileReader(); fr.onload=()=>{const text=fr.result; try{const arr=JSON.parse(text); if(Array.isArray(arr)&&arr.length){designs=arr.slice(0,6); activeId=designs[0].id||Date.now()+""; render(); return;}}catch(e){const rows=String(text).trim().split(/\r?\n/); const header=rows[0].split(","); const out=[]; for(let i=1;i<rows.length;i++){const vals=rows[i].split(","); const o={}; header.forEach((k,ix)=>o[k]=vals[ix]); out.push(o);} if(out.length){designs=out.slice(0,6).map((o,i)=>Object.assign(blankDesign(i),o)); activeId=designs[0].id; render(); }}}; fr.readAsText(file);}
document.getElementById("btnAdd").onclick=addDesign;
document.getElementById("btnRemove").onclick=removeActive;
document.getElementById("btnExportJSON").onclick=exportJSON;
document.getElementById("btnExportCSV").onclick=exportCSV;
document.getElementById("importFile").addEventListener("change",(e)=>{const f=e.target.files[0]; if(f) importFile(f);});
render();

// 置頂欄的 Step1/Step2 功能
/*document.getElementById("btnStep1Top").onclick = () => {
  const d = designs.find(x => x.id === activeId);
  if (d) { computeStep1(d); render(); }
};

document.getElementById("btnStep2Top").onclick = () => {
  const d = designs.find(x => x.id === activeId);
  if (d) { computeStep2(d); render(); }
};*/

document.getElementById("btnStep1Top").onclick = () => {
  designs.forEach(design => computeStep1(design));
  render();
};
document.getElementById("btnStep2Top").onclick = () => {
  designs.forEach(design => computeStep2(design));
  render();
};


// -----------------------------------------------------------------------------
// Overrides for Step2 and Summary rendering
// These definitions replace earlier versions to support total row, column layout
// for mass breakdown and horizontal arrangement across designs.

// === 按鈕 2：產生 Summary 與 Strip 長度 ===
// 此區塊只輸出 KPI 指標與各層 Strip 長度表格
// Mass breakdown 會在 renderSummaryAll 中集中顯示
function sectionStep2(d){
  const w = el("div",{className:"card"});
  w.append(el("div",{className:"title",innerText:"Summary & Mass Breakdown"})); // 去掉「按鈕 2」文字
  const r = step2[d.id];
  if(!r){
    w.append(el("div",{className:"small",innerText:"尚未執行計算"}));
    return w;
  }
  // KPI boxes
  const kpi = el("div",{className:"kpi"});
  const kv = (k,v,u="")=>{
    const box = el("div",{className:"box"}); 
    // turns 與 n4 顯示整數
    let val = (k==="turns" || k==="n4") ? Math.round(v) : fmt(v, u.includes("Wh") ? 1 : 3);
    box.append(
      el("div",{className:"k",innerText:k}),
      el("div",{className:"v",innerText:val+" "+u})
    );
    return box;
  };
  kpi.append(
    kv("Capacity",r.capAh,"Ah"),
    kv("Energy",r.EWh,"Wh"),
    kv("turns",r.turns,""),
    kv("n4",fmt(r.n4,1),"") 
  );
  kpi.append(
    kv("Wh/L(core)",r.WhL_core,"Wh/L"),
    kv("Wh/kg(core)",r.Whkg_core,"Wh/kg"),
    kv("Wh/L(ext)",r.WhL_ext,"Wh/L"),
    kv("Wh/kg(ext)",r.Whkg_ext,"Wh/kg")
  );
  w.append(kpi);
  // Strip length table
  /*const st=el("table",{className:"table"});
  st.innerHTML="<thead><tr><th>Layer</th><th>Strip length (mm)</th></tr></thead>";
  const tb=el("tbody");
  [["S1", r.Ls.L_S1],["C", r.Ls.L_C],["S2", r.Ls.L_S2],["A", r.Ls.L_A]].forEach(([k,v])=>{
    const tr=el("tr");
    tr.append(el("td",{innerText:k}), el("td",{innerText:fmt(v,1)}));
    tb.append(tr);
  });
  st.append(tb);
  w.append(el("div",{className:"card"},[st]));*/
    return w;

}

// === Summary 匯總與質量分佈圖表 ===
// 在所有設計計算完成後，用此函式產生總結表與質量分佈餅圖
function renderSummaryAll(){
  const wrap=el("div",{className:"card"});
  wrap.append(el("div",{className:"title",innerText:"Summary"}));
  const t=el("table",{className:"table"});
  t.innerHTML=`<thead><tr>
    <th>Design Name</th><th>Capacity (Ah)</th><th>Energy (Wh)</th>
    <th>Wh/L(ext)</th><th>Wh/kg(ext)</th><th>Wh/L(core)</th><th>Wh/kg(core)</th>
    <th>turns</th><th>n4</th><th>Strip S1</th><th>Strip C</th><th>Strip S2</th><th>Strip A</th>
  </tr></thead>`;
  const tb=el("tbody");
  designs.forEach(d=>{
    if(!step2[d.id]) return;
    const r=step2[d.id];
    const tr=el("tr");
    [(d.design_name||d.name), fmt(r.capAh,3), fmt(r.EWh,3), fmt(r.WhL_ext,1), fmt(r.Whkg_ext,1), fmt(r.WhL_core,1), fmt(r.Whkg_core,1), r.turns, r.n4, fmt(r.Ls.L_S1,1), fmt(r.Ls.L_C,1), fmt(r.Ls.L_S2,1), fmt(r.Ls.L_A,1)]
      .forEach(v=> tr.append(el("td",{innerText:String(v)})));
    tb.append(tr);
  });
  t.append(tb);
  wrap.append(t);
  // Mass breakdown grid
  const mg=el("div",{className:"mass-grid"});
  designs.forEach((d,idx)=>{
    if(!step2[d.id]) return;
    const r=step2[d.id];
    const card=el("div",{className:"card"});
    card.append(el("div",{className:"title",innerText:`${d.name}：Mass breakdown`}));
    const items=[
      ["Cathode active", r.m.m_active_C_g],
      ["Anode active", r.m.m_active_A_g],
      ["Cathode collector", r.m.m_collector_C_g],
      ["Anode collector", r.m.m_collector_A_g],
      ["Separator #1", r.m.m_S1_g],
      ["Separator #2", r.m.m_S2_g],
      ["Electrolyte", r.m.m_elyte_g],
      ["Tab_C", r.m.m_tab_c_g],
      ["Tab_A", r.m.m_tab_a_g],
      ["Can", r.m.m_can_g],
      ["Components", r.m.m_components_g]];
    const sum=items.reduce((s,x)=>s+num(x[1]),0);
    const full=[...items,["Total",sum]];
    const table=el("table",{className:"table"});
    table.innerHTML="<thead><tr><th></th><th>組成</th><th>質量(g)</th><th>占比(%)</th></tr></thead>";
    const tb2=el("tbody");
    full.forEach((it,i)=>{
      const tr=el("tr");
      const color=COLORS[i%COLORS.length];
      const sw=el("div",{className:"swatch"}); sw.style.background=color;
      const td0=el("td"); td0.append(sw);
      const share=i===full.length-1?100:(sum?it[1]/sum*100:0);
      tr.append(td0,
        el("td",{innerText:it[0]}),
        el("td",{innerText:fmt(it[1],2)}),
        el("td",{innerText:fmt(share,1)})
      );
      tb2.append(tr);
    });
    table.append(tb2);
    const pieData=items.map((x,i)=>({name:x[0],value:num(x[1]),color:COLORS[i%COLORS.length]}));
    const pie=drawPie(pieData);
    const split=el("div",{className:"split-col"});
    split.append(table,pie);
    card.append(split);
    mg.append(card);
  });
  wrap.append(mg);
  return wrap;
}
