import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { LogOut, LockKeyhole, Mail, UserRound, Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, BookOpen, CalendarDays, CheckCircle2, ChevronDown, ClipboardList, Dumbbell, Flame, Layers3, Menu, Pencil, Plus, Save, Search, Sparkles, Trash2, X } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, type Account } from './api';
import type { Exercise, ExerciseSet, Template, ViewName, Workout } from './types';
import { currentAndPrevious, filterWorkoutsByDate, maxSetWeight, personalBest, progress, volume, weeklyMuscles } from './stats';
import { fmtDate, fmtMonth, fmtNumber, languageKey, tr, type Language } from './i18n';

const today=()=>new Date().toLocaleDateString('en-CA');
const names:Record<ViewName,string>={dashboard:'Обзор',journal:'Дневник',exercises:'Упражнения',analytics:'Аналитика',templates:'Шаблоны'};
const formatPercent=(now:number,previous:number)=>previous?Math.round((now-previous)/previous*100):now?100:0;
const createSet=(id:number):ExerciseSet=>({exerciseId:id,repetitions:10,weightKg:0,durationSeconds:0});
const muscleGroups=['Ноги','Грудь','Спина','Плечи','Руки','Корпус','Кардио','Другое'];
const initialLanguage=():Language=>{try{return localStorage.getItem(languageKey)==='en'?'en':'ru'}catch{return 'ru'}};

type TabButtonProps={tab:ViewName;active:ViewName;onClick:(tab:ViewName)=>void;icon:typeof Activity;language:Language};
function TabButton({tab,active,onClick,icon:Icon,language}:TabButtonProps){return <button type="button" className={`nav-btn ${active===tab?'active':''}`} onClick={()=>onClick(tab)}><Icon size={19}/><span>{tr(language,names[tab])}</span>{active===tab&&<span className="nav-dot"/>}</button>}
function StatCard({title,value,subtitle,icon:Icon,tone='neutral'}:{title:string;value:string;subtitle:string;icon:typeof Activity;tone?:'neutral'|'mint'|'peach'}){return <div className={`stat-card ${tone}`}><span className="stat-icon"><Icon size={21}/></span><div className="stat-title">{title}</div><div className="stat-value">{value}</div><div className="stat-subtitle">{subtitle}</div></div>}
function EmptyState({icon:Icon,title,subtitle,onClick,action}:{icon:typeof Activity;title:string;subtitle:string;onClick?:()=>void;action?:string}){return <div className="empty"><div className="empty-icon"><Icon size={26}/></div><strong>{title}</strong><p>{subtitle}</p>{onClick&&<button className="btn btn-primary" onClick={onClick}>{action||'Добавить'} <ArrowRight size={16}/></button>}</div>}

export default function App(){
  const [user,setUser]=useState<Account|null>(null);
  const refreshSerial=useRef(0);
  const [authLoading,setAuthLoading]=useState(true);
  const [authMode,setAuthMode]=useState<'login'|'register'>('login');
  const [authName,setAuthName]=useState('');
  const [authEmail,setAuthEmail]=useState('');
  const [authPassword,setAuthPassword]=useState('');
  const [authError,setAuthError]=useState('');
  const [authBusy,setAuthBusy]=useState(false);
  const [view,setView]=useState<ViewName>('dashboard');
  const [language,setLanguage]=useState<Language>(initialLanguage);
  const [workouts,setWorkouts]=useState<Workout[]>([]);
  const [exercises,setExercises]=useState<Exercise[]>([]);
  const [templates,setTemplates]=useState<Template[]>([]);
  const [pending,setPending]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [drawer,setDrawer]=useState(false);
  const [editor,setEditor]=useState(false);
  const [editingWorkoutId,setEditingWorkoutId]=useState<number|null>(null);
  const [filterFrom,setFilterFrom]=useState('');
  const [filterTo,setFilterTo]=useState('');
  const [volumeMode,setVolumeMode]=useState<'weight'|'volume'>('weight');
  const [exerciseEditor,setExerciseEditor]=useState(false);
  const [sport,setSport]=useState('Силовая тренировка');
  const [day,setDay]=useState(today());
  const [minutes,setMinutes]=useState(45);
  const [notes,setNotes]=useState('');
  const [sets,setSets]=useState<ExerciseSet[]>([]);
  const [newName,setNewName]=useState('');
  const [muscleGroup,setMuscleGroup]=useState('Ноги');
  const [newDescription,setNewDescription]=useState('');
  const [exerciseSearch,setExerciseSearch]=useState('');
  const [selectedExercise,setSelectedExercise]=useState<number>(0);

  const t=(text:string)=>tr(language,text);
  const n=(value:number)=>fmtNumber(language,value);
  const d=(iso:string)=>fmtDate(language,iso);
  const display=(value:string)=>tr(language,value);
  useEffect(()=>{try{localStorage.setItem(languageKey,language)}catch{/* private mode */}document.documentElement.lang=language;},[language]);

  const refresh=useCallback(async()=>{
    const serial=++refreshSerial.current;
    try {
      const [w,e,t]=await Promise.all([api.workouts(),api.exercises(),api.templates()]);
      if (serial!==refreshSerial.current) return;
      setWorkouts(w);setExercises(e);setTemplates(t);
      setSelectedExercise(id=>e.some(item=>item.id===id)?id:e[0]?.id||0);setError('');
    }catch(e){if(serial===refreshSerial.current)setError(e instanceof Error?e.message:'Не удалось загрузить данные');}
    finally {if(serial===refreshSerial.current)setPending(false);}
  },[]);
  // Restore only the server-validated HttpOnly-cookie session; never store credentials in localStorage.
  useEffect(()=>{
    let alive=true;
    api.me().then(account=>{if(alive)setUser(account)}).catch(()=>{if(alive)setUser(null)}).finally(()=>{if(alive)setAuthLoading(false)});
    return ()=>{alive=false};
  },[]);
  useEffect(()=>{if(user){setPending(true);void refresh();}},[user?.id,refresh]);
  useEffect(()=>{
    const expired=()=>{refreshSerial.current++;setUser(null);setWorkouts([]);setExercises([]);setTemplates([]);setAuthError(t('Сессия истекла. Войдите снова.'));};
    window.addEventListener('fitprogress:session-expired',expired);
    return ()=>window.removeEventListener('fitprogress:session-expired',expired);
  },[language]);
  async function submitAuth(event:FormEvent){
    event.preventDefault();setAuthBusy(true);setAuthError('');
    try {
      const account=authMode==='login'
        ? await api.login({email:authEmail,password:authPassword})
        : await api.register({name:authName,email:authEmail,password:authPassword});
      setAuthPassword('');setUser(account);setView('dashboard');setPending(true);
    }catch(error){setAuthError(error instanceof Error?error.message:t('Ошибка входа'));}
    finally{setAuthBusy(false);}
  }
  async function logout(){
    try{await api.logout();}catch(error){setError(error instanceof Error?error.message:'Ошибка выхода');return;}
    refreshSerial.current++;setUser(null);setWorkouts([]);setExercises([]);setTemplates([]);setSelectedExercise(0);
    setEditor(false);setEditingWorkoutId(null);setNotice('');setError('');setAuthPassword('');
  }
  const stats=useMemo(()=>currentAndPrevious(workouts),[workouts]);
  const muscleData=useMemo(()=>weeklyMuscles(workouts,exercises).map(row=>({...row,name:display(row.name)})),[workouts,exercises,language]);
  const timeline=useMemo(()=>progress(workouts,selectedExercise).map(row=>({...row,date:d(row.rawDate)})),[workouts,selectedExercise,language]);
  const record=useMemo(()=>personalBest(workouts,selectedExercise),[workouts,selectedExercise]);
  const filteredExercises=useMemo(()=>exercises.filter(e=>(e.name+' '+e.muscleGroup+' '+display(e.name)+' '+display(e.muscleGroup)).toLowerCase().includes(exerciseSearch.toLowerCase())),[exercises,exerciseSearch,language]);
  const totals=useMemo(()=>({count:workouts.length,minutes:workouts.reduce((n,w)=>n+w.durationMinutes,0),maxWeight:workouts.reduce((n,w)=>Math.max(n,maxSetWeight(w)),0)}),[workouts]);
  const visibleWorkouts=useMemo(()=>filterWorkoutsByDate(workouts,filterFrom,filterTo),[workouts,filterFrom,filterTo]);

  function go(tab:ViewName){setView(tab);setDrawer(false);setEditor(false);setEditingWorkoutId(null);setExerciseEditor(false);}
  function openWorkout(template?:Template){
    setEditingWorkoutId(null);
    setDay(today());setSport(template?.sportType||t('Силовая тренировка'));setMinutes(template?.durationMinutes||45);
    setNotes('');setSets(template?template.sets.map(s=>({exerciseId:s.exerciseId,repetitions:s.repetitions,weightKg:s.weightKg,durationSeconds:s.durationSeconds})):exercises[0]?[createSet(exercises[0].id)]:[]);
    setEditor(true);setView('journal');setError('');
  }
  function editWorkout(workout:Workout){
    setEditingWorkoutId(workout.id);setDay(workout.performedOn);setSport(workout.sportType);
    setMinutes(workout.durationMinutes);setNotes(workout.notes||'');
    setSets(workout.sets.map(s=>({exerciseId:s.exerciseId,repetitions:s.repetitions,weightKg:s.weightKg,durationSeconds:s.durationSeconds})));
    setEditor(true);setView('journal');setError('');window.scrollTo({top:0,behavior:'smooth'});
  }
  function updateSet(index:number,key:keyof ExerciseSet,value:number){setSets(list=>list.map((set,i)=>i===index?{...set,[key]:value}:set));}
  async function addWorkout(event:FormEvent){
    event.preventDefault();if(!sets.length){setError('Добавьте хотя бы один подход.');return;}
    setBusy(true);setError('');
    try {
      const draft={performedOn:day,sportType:sport,durationMinutes:minutes,notes,sets};
      if(editingWorkoutId!==null) await api.updateWorkout(editingWorkoutId,draft);
      else await api.addWorkout(draft);
      await refresh();setEditor(false);setEditingWorkoutId(null);setNotice(editingWorkoutId!==null?'Тренировка обновлена':'Тренировка сохранена');
    }
    catch(e){setError(e instanceof Error?e.message:t('Не удалось сохранить тренировку'));}
    finally {setBusy(false);}
  }
  async function addExercise(event:FormEvent){
    event.preventDefault();setBusy(true);setError('');
    try {await api.addExercise({name:newName,muscleGroup,description:newDescription});setNewName('');setNewDescription('');setExerciseEditor(false);await refresh();setNotice('Упражнение добавлено');}
    catch(e){setError(e instanceof Error?e.message:t('Ошибка добавления'));}
    finally {setBusy(false);}
  }
  async function deleteWorkout(id:number){
    if(!window.confirm(t('Удалить тренировку без возможности восстановления?')))return;
    try{await api.deleteWorkout(id);await refresh();setNotice('Запись удалена');}catch(e){setError(e instanceof Error?e.message:t('Ошибка удаления'));}
  }
  async function saveAsTemplate(workout:Workout){
    const name=window.prompt(t('Название нового шаблона:'),`${display(workout.sportType)} — ${t('шаблон')}`);
    if(!name?.trim())return;
    try {await api.addTemplate({name:name.trim(),sportType:workout.sportType,durationMinutes:workout.durationMinutes,sets:workout.sets.map(s=>({exerciseId:s.exerciseId,repetitions:s.repetitions,weightKg:s.weightKg,durationSeconds:s.durationSeconds}))});await refresh();setNotice('Шаблон создан');}
    catch(e){setError(e instanceof Error?e.message:t('Ошибка сохранения шаблона'));}
  }
  async function deleteTemplate(id:number){
    if(!window.confirm(t('Удалить шаблон?')))return;
    try{await api.deleteTemplate(id);await refresh();setNotice('Шаблон удалён');}catch(e){setError(e instanceof Error?e.message:t('Ошибка удаления'));}
  }
  const currentMonth=fmtMonth(language);

  if(authLoading)return <div className="auth-page"><div className="auth-card"><div className="auth-brand"><Activity size={24}/> FitProgress</div><p>{t('Загрузка...')}</p></div></div>;
  if(!user)return <div className="auth-page">
    <form className="auth-card" onSubmit={submitAuth}>
      <div className="auth-brand"><Activity size={28}/> Fit<span>Progress</span></div>
      <div className="auth-lang lang-switch" role="group" aria-label="Language"><button type="button" className={language==='ru'?'selected':''} onClick={()=>setLanguage('ru')}>RU</button><button type="button" className={language==='en'?'selected':''} onClick={()=>setLanguage('en')}>EN</button></div>
      <div className="overline">{t('ЛИЧНЫЙ КАБИНЕТ')}</div>
      <h1>{t(authMode==='login'?'Вход в аккаунт':'Создать аккаунт')}</h1>
      <p className="auth-description">{t('Ваши тренировки и шаблоны доступны только вам.')}</p>
      {authError&&<p className="auth-error" role="alert">{t(authError)}</p>}
      {authMode==='register'&&<label><span><UserRound size={16}/>{t('Имя')}</span><input autoComplete="name" minLength={2} maxLength={80} required value={authName} onChange={e=>setAuthName(e.target.value)} placeholder={t('Ваше имя')}/></label>}
      <label><span><Mail size={16}/>Email</span><input type="email" autoComplete="email" maxLength={254} required value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="name@example.com"/></label>
      <label><span><LockKeyhole size={16}/>{t('Пароль')}</span><input type="password" autoComplete={authMode==='login'?'current-password':'new-password'} minLength={authMode==='register'?10:1} maxLength={128} required value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder={t('Не менее 10 символов')}/></label>
      <button type="submit" className="btn btn-primary auth-submit" disabled={authBusy}>{authBusy?t('Подождите...'):t(authMode==='login'?'Войти':'Зарегистрироваться')} <ArrowRight size={18}/></button>
      <button type="button" className="auth-mode-toggle" onClick={()=>{setAuthMode(authMode==='login'?'register':'login');setAuthError('');setAuthPassword('')}}>{t(authMode==='login'?'Нет аккаунта? Зарегистрироваться':'Уже есть аккаунт? Войти')}</button>
    </form>
  </div>;
  return <div className="shell">
    {drawer&&<button className="mobile-shade" aria-label={t('Закрыть меню')} onClick={()=>setDrawer(false)}/>}
    <aside className={`sidebar ${drawer?'show':''}`}>
      <div className="logo"><div className="logo-mark"><Activity size={23} strokeWidth={2.5}/></div><span>Fit<span className="logo-accent">Progress</span></span></div>
      <div className="side-label">{t('РАБОЧЕЕ ПРОСТРАНСТВО')}</div>
      <nav className="navigation">
        <TabButton tab="dashboard" active={view} onClick={go} icon={Layers3} language={language}/>
        <TabButton tab="journal" active={view} onClick={go} icon={CalendarDays} language={language}/>
        <TabButton tab="exercises" active={view} onClick={go} icon={Dumbbell} language={language}/>
        <TabButton tab="analytics" active={view} onClick={go} icon={BarChart3} language={language}/>
        <TabButton tab="templates" active={view} onClick={go} icon={BookOpen} language={language}/>
      </nav>
      <div className="side-spacer"/>
      <div className="side-inset"><span className="side-inset-icon"><Sparkles size={18}/></span><strong>{t('Ваш прогресс — в цифрах')}</strong><p>{t('Записывайте тренировки, наблюдайте динамику и отмечайте рекорды.')}</p></div>
      <div className="side-bottom"><span className="avatar">{user.name.slice(0,2).toUpperCase()}</span><div><strong>{user.name}</strong><span>{user.email}</span></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="mobile-menu" onClick={()=>setDrawer(true)} aria-label={t('Открыть меню')}><Menu size={23}/></button><div className="crumb">{t('Рабочее пространство')} <span>/</span> <strong>{t(names[view])}</strong></div><div className="top-actions"><div className="lang-switch" role="group" aria-label="Language / Язык"><button type="button" className={language==='ru'?'selected':''} onClick={()=>setLanguage('ru')} aria-pressed={language==='ru'}>RU</button><button type="button" className={language==='en'?'selected':''} onClick={()=>setLanguage('en')} aria-pressed={language==='en'}>EN</button></div><span className="today-label"><CalendarDays size={15}/>{new Date().toLocaleDateString(language==='en'?'en-US':'ru-RU',{day:'numeric',month:'long',year:'numeric'})}</span><span className="top-avatar">{user.name.slice(0,2).toUpperCase()}</span><button className="logout-button" type="button" onClick={()=>void logout()} title={t('Выйти')} aria-label={t('Выйти')}><LogOut size={17}/><span>{t('Выйти')}</span></button></div></header>
      <div className="content">
        {error&&<div className="alert" role="alert"><span>{t(error)}</span><button onClick={()=>setError('')}><X size={17}/></button></div>}
        {notice&&<div className="notice"><CheckCircle2 size={18}/>{t(notice)}<button aria-label={t('Закрыть')} onClick={()=>setNotice('')}><X size={16}/></button></div>}
        {pending?<div className="loading">{t('Загрузка тренировочного дневника…')}</div>:<>
        {view==='dashboard'&&<>
          <div className="hero"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot"/> {t('ТРЕНИРУЙТЕСЬ ОСОЗНАННО')}</div><h1>{t('Каждый шаг —')}<br/><em>{t('ваш прогресс.')}</em></h1><p>{t('Организуйте тренировки, анализируйте результаты и двигайтесь к своим целям в собственном ритме.')}</p><button className="btn btn-dark" onClick={()=>openWorkout()}><Plus size={18}/> {t('Записать тренировку')} <ArrowRight size={16}/></button></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="hero-symbol"><Dumbbell size={72} strokeWidth={1.5}/></div><span className="hero-bubble">{t('+1 день к результату')} <ArrowUpRight size={14}/></span></div></div>
          <div className="section-heading"><div><div className="overline">{t('ВАШИ ПОКАЗАТЕЛИ')}</div><h2>{t('Коротко о главном')}</h2></div><span className="subtle">{t('За всё время')}</span></div>
          <div className="stats-grid"><StatCard title={t('Тренировок')} value={n(totals.count)} subtitle={t('Всего записано')} icon={CalendarDays} tone="mint"/><StatCard title={t('Максимальный вес')} value={`${n(totals.maxWeight)} ${language==='en'?'kg':'кг'}`} subtitle={t('Самый тяжёлый подход, а не сумма повторений')} icon={Dumbbell}/><StatCard title={t('Время занятий')} value={`${n(Math.round(totals.minutes/60*10)/10)} ${language==='en'?'h':'ч'}`} subtitle={t('В движении')} icon={Flame} tone="peach"/></div>
          <div className="two-col"><div className="panel"><div className="panel-heading"><div><div className="overline">{t('ДИНАМИКА')}</div><h3>{t('Максимальный вес по тренировкам')}</h3></div><button className="text-btn" onClick={()=>go('analytics')}>{t('Аналитика')} <ArrowRight size={16}/></button></div>{timeline.length?<div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={timeline}><defs><linearGradient id="fillLine" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#72a996" stopOpacity={.4}/><stop offset="100%" stopColor="#72a996" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#ecf0eb"/><XAxis dataKey="date" tickLine={false} axisLine={false}/><YAxis tickLine={false} axisLine={false} width={44}/><Tooltip/><Area dataKey="maxWeight" stroke="#2f7c63" strokeWidth={3} fill="url(#fillLine)" name={t('Макс. вес (кг)')}/></AreaChart></ResponsiveContainer></div>:<EmptyState icon={BarChart3} title={t('Пока нет данных')} subtitle={t('Добавьте первую тренировку, чтобы увидеть динамику.')} onClick={()=>openWorkout()} action={t('Добавить тренировку')}/>}</div>
          <div className="panel"><div className="panel-heading"><div><div className="overline">{t('ПОСЛЕДНИЕ ЗАПИСИ')}</div><h3>{t('Недавние тренировки')}</h3></div><button className="text-btn" onClick={()=>go('journal')}>{t('Все записи')} <ArrowRight size={16}/></button></div>{workouts.length?<div className="recent-list">{workouts.slice(0,4).map(w=><div className="recent-item" key={w.id}><div className="recent-icon"><Activity size={18}/></div><div className="recent-main"><strong>{display(w.sportType)}</strong><span>{d(w.performedOn)} · {w.sets.length} {language==='en'?'sets':'подходов'}</span></div><div className="recent-val"><strong>{n(maxSetWeight(w))} {language==='en'?'kg':'кг'}</strong><small>{t('Максимальный вес в подходе')}</small></div></div>)}</div>:<EmptyState icon={ClipboardList} title={t('Дневник пуст')} subtitle={t('Сохраняйте занятия и возвращайтесь к ним в любое время.')} onClick={()=>openWorkout()} action={t('Начать')}/>}</div></div>
        </>}

        {view==='journal'&&<>
          <div className="page-heading"><div><div className="overline">{t('ДНЕВНИК ТРЕНИРОВОК')}</div><h1>{t('История активности')}<span className="dot-end">.</span></h1><p>{t('Подробные записи о каждом занятии.')}</p></div><button className="btn btn-primary" onClick={()=>{if(editor){setEditor(false);setEditingWorkoutId(null)}else openWorkout()}}>{editor?<X size={17}/>:<Plus size={17}/>} {editor?t('Закрыть'):t('Новая тренировка')}</button></div>
          {editor&&<form className="panel form-panel" onSubmit={addWorkout}><div className="panel-heading"><div><div className="overline">{t('ЗАПИСЬ')}</div><h3>{t(editingWorkoutId!==null?'Редактировать тренировку':'Новая тренировка')}</h3></div></div><div className="form-grid"><label>{t('Дата')}<input type="date" value={day} onChange={e=>setDay(e.target.value)} required/></label><label>{t('Вид спорта')}<input value={sport} onChange={e=>setSport(e.target.value)} maxLength={90} required/></label><label>{t('Продолжительность (мин)')}<input type="number" min="0" max="1440" value={minutes} onChange={e=>setMinutes(Number(e.target.value))} required/></label><label>{t('Заметки')}<input value={notes} maxLength={2000} onChange={e=>setNotes(e.target.value)} placeholder={t('Как прошло занятие?')}/></label></div>
            <div className="sets-title"><h4>{t('Подходы и упражнения')}</h4><span>{sets.length} {language==='en'?'sets':'шт.'}</span></div>
            {sets.map((set,i)=><div className="set-editor" key={i}><label>{t('Упражнение')}<select value={set.exerciseId} onChange={e=>updateSet(i,'exerciseId',Number(e.target.value))}>{exercises.map(ex=><option key={ex.id} value={ex.id}>{display(ex.name)}</option>)}</select></label><label>{t('Повторения')}<input type="number" value={set.repetitions} min="0" max="100000" onChange={e=>updateSet(i,'repetitions',Number(e.target.value))}/></label><label>{t('Вес, кг')}<input type="number" min="0" max="100000" step="0.5" value={set.weightKg} onChange={e=>updateSet(i,'weightKg',Number(e.target.value))}/></label><label>{t('Время, сек')}<input type="number" min="0" max="86400" value={set.durationSeconds} onChange={e=>updateSet(i,'durationSeconds',Number(e.target.value))}/></label><button className="icon-button remove-set" type="button" onClick={()=>setSets(list=>list.filter((_,j)=>j!==i))} aria-label={t('Удалить подход')}><Trash2 size={18}/></button></div>)}
            <div className="calculation-note"><strong>{t('Вес, кг — это вес в одном повторении.')}</strong><span>{t('Объём тренировки считается отдельно: вес × повторения. Например, 20 кг × 10 повторений = 200 кг объёма; сам вес остаётся 20 кг.')}</span></div>
            <div className="form-actions"><button type="button" className="btn btn-ghost" disabled={!exercises.length} onClick={()=>setSets(list=>[...list,createSet(exercises[0].id)])}><Plus size={17}/> {t('Добавить подход')}</button><button className="btn btn-primary" type="submit" disabled={busy||!sets.length}><Save size={17}/> {busy?t('Сохранение...'):t(editingWorkoutId!==null?'Сохранить изменения':'Сохранить тренировку')}</button></div></form>}
          <div className="journal-filters"><label>{t('С даты')}<input type="date" value={filterFrom} max={filterTo||undefined} onChange={e=>setFilterFrom(e.target.value)}/></label><label>{t('По дату')}<input type="date" value={filterTo} min={filterFrom||undefined} onChange={e=>setFilterTo(e.target.value)}/></label><button type="button" className="btn btn-ghost" onClick={()=>{setFilterFrom('');setFilterTo('')}}>{t('Сбросить фильтр')}</button><span>{visibleWorkouts.length} {t('записей')}</span></div>
          {!workouts.length&&!editor?<div className="panel"><EmptyState icon={ClipboardList} title={t('Здесь будут ваши тренировки')} subtitle={t('После добавления первой записи появится история занятий.')} onClick={()=>openWorkout()} action={t('Добавить запись')}/></div>:<div className="workout-list">{visibleWorkouts.map(w=><article className="workout-card" key={w.id}><div className="workout-main"><span className="date-chip"><CalendarDays size={14}/> {d(w.performedOn)}</span><h3>{display(w.sportType)}</h3><div className="workout-meta"><span>{w.durationMinutes} {language==='en'?'min':'мин'}</span><span>•</span><span>{w.sets.length} {language==='en'?'sets':'подходов'}</span><span>•</span><span>{t('Макс. вес:')} {n(maxSetWeight(w))} {language==='en'?'kg':'кг'}</span></div>{w.notes&&<p>{w.notes}</p>}<div className="set-chips">{w.sets.slice(0,6).map((s,i)=><span key={i}>{display(s.exerciseName || exercises.find(e=>e.id===s.exerciseId)?.name || '')}: {s.repetitions?`${n(s.weightKg)} ${language==='en'?'kg':'кг'} × ${s.repetitions} ${t('повт.')}`:`${s.durationSeconds} ${language==='en'?'sec':'сек'}`}</span>)}{w.sets.length>6&&<span>+{w.sets.length-6}</span>}</div>{volume(w)>0&&<p className="workout-volume-note">{t('Расчётный объём (вес × повторения):')} {n(volume(w))} {language==='en'?'kg':'кг'} — {t('это не фактический вес снаряда')}</p>}</div><div className="workout-actions"><button className="icon-button" title={t('Редактировать тренировку')} aria-label={t('Редактировать тренировку')} onClick={()=>editWorkout(w)}><Pencil size={18}/></button><button className="icon-button" title={t('Сохранить как шаблон')} onClick={()=>saveAsTemplate(w)}><Save size={18}/></button><button className="icon-button danger" title={t('Удалить запись')} onClick={()=>deleteWorkout(w.id)}><Trash2 size={18}/></button></div></article>)}</div>}
        </>}

        {view==='exercises'&&<>
          <div className="page-heading"><div><div className="overline">{t('СПРАВОЧНИК')}</div><h1>{t('База упражнений')}<span className="dot-end">.</span></h1><p>{t('Готовые упражнения и ваши собственные варианты.')}</p></div><button className="btn btn-primary" onClick={()=>setExerciseEditor(v=>!v)}>{exerciseEditor?<X size={17}/>:<Plus size={17}/>} {exerciseEditor?t('Закрыть'):t('Добавить упражнение')}</button></div>
          {exerciseEditor&&<form className="panel form-panel" onSubmit={addExercise}><h3>{t('Новое упражнение')}</h3><div className="form-grid"><label>{t('Название')}<input required minLength={2} maxLength={120} value={newName} onChange={e=>setNewName(e.target.value)} placeholder={t('Например: отжимания')}/></label><label>{t('Группа мышц')}<select value={muscleGroup} onChange={e=>setMuscleGroup(e.target.value)}>{muscleGroups.map(g=><option key={g} value={g}>{display(g)}</option>)}</select></label><label className="wide">{t('Описание техники')}<input maxLength={1000} value={newDescription} onChange={e=>setNewDescription(e.target.value)} placeholder={t('Краткое описание')}/></label></div><div className="form-actions"><button className="btn btn-primary" disabled={busy} type="submit"><Plus size={17}/> {t('Сохранить')}</button></div></form>}
          <div className="search-row"><Search size={18}/><input placeholder={t('Поиск по названию или группе мышц')} value={exerciseSearch} onChange={e=>setExerciseSearch(e.target.value)}/><span>{filteredExercises.length} {language==='en'?'exercises':'упражнений'}</span></div>
          <div className="exercise-grid">{filteredExercises.map(ex=><article key={ex.id} className="exercise-card"><div className="exercise-symbol"><Dumbbell size={20}/></div><div><span className="category">{display(ex.muscleGroup)}</span><h3>{display(ex.name)}</h3><p>{ex.description?display(ex.description):t('Пользовательское упражнение')}</p></div><button className="round-link" aria-label={t('Открыть аналитику')} onClick={()=>{setSelectedExercise(ex.id);go('analytics')}}><ArrowUpRight size={19}/></button></article>)}</div>
        </>}

        {view==='analytics'&&<>
          <div className="page-heading"><div><div className="overline">{t('РЕЗУЛЬТАТЫ')}</div><h1>{t('Аналитика прогресса')}<span className="dot-end">.</span></h1><p>{t('Динамика нагрузок, рекорды и сравнение периодов.')}</p></div></div>
          <div className="section-heading short"><div><div className="overline">{t('СРАВНЕНИЕ ПЕРИОДОВ')}</div><h2>{currentMonth[0]?.toUpperCase()+currentMonth.slice(1)} / {t('предыдущий месяц')}</h2></div></div>
          <div className="stats-grid"><StatCard title={t('Тренировок в этом месяце')} value={String(stats.current.count)} subtitle={`${t('Было')} ${stats.previous.count} · ${t('изменение')} ${formatPercent(stats.current.count,stats.previous.count)}%`} icon={CalendarDays} tone="mint"/><StatCard title={t('Максимальный вес за месяц')} value={`${n(stats.current.maxWeight)} ${language==='en'?'kg':'кг'}`} subtitle={`${t('Было')} ${n(stats.previous.maxWeight)} ${language==='en'?'kg':'кг'}`} icon={Dumbbell}/><StatCard title={t('Средняя длительность')} value={`${stats.current.averageMinutes} ${language==='en'?'min':'мин'}`} subtitle={`${t('Было')} ${stats.previous.averageMinutes} ${language==='en'?'min':'мин'}`} icon={Activity} tone="peach"/></div>
          <div className="two-col analytics-grid"><section className="panel"><div className="panel-heading"><div><div className="overline">{t('ПО УПРАЖНЕНИЮ')}</div><h3>{t('Прогресс и рекорды')}</h3></div></div><div className="chart-select"><span>{t('Выберите упражнение')}</span><select value={selectedExercise} onChange={e=>setSelectedExercise(Number(e.target.value))}>{exercises.map(ex=><option key={ex.id} value={ex.id}>{display(ex.name)}</option>)}</select><ChevronDown size={16}/></div>{record&&<div className="personal-best"><Sparkles size={17}/> {t('Личный рекорд:')} <strong>{n(record.weight)} {language==='en'?'kg':'кг'}</strong> <span>· {d(record.date)}</span></div>}{timeline.length?<div className="chart tall"><ResponsiveContainer width="100%" height="100%"><AreaChart data={timeline}><defs><linearGradient id="fillStats" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f7c63" stopOpacity={.2}/><stop offset="1" stopColor="#2f7c63" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#edf0eb" vertical={false}/><XAxis dataKey="date" tickLine={false} axisLine={false}/><YAxis tickLine={false} axisLine={false} width={40}/><Tooltip/><Area type="monotone" dataKey="maxWeight" name={t('Макс. вес (кг)')} stroke="#2f7c63" strokeWidth={3} fill="url(#fillStats)"/></AreaChart></ResponsiveContainer></div>:<EmptyState icon={ArrowUpRight} title={t('Нет данных по упражнению')} subtitle={t('Добавьте тренировку с выбранным упражнением.')} onClick={()=>openWorkout()} action={t('Создать тренировку')}/>}</section>
          <section className="panel"><div className="panel-heading"><div><div className="overline">{t('ЗА ПОСЛЕДНИЕ 7 ДНЕЙ')}</div><h3>{t(volumeMode==='weight'?'Максимальный вес по группам мышц':'Расчётный объём по группам мышц')}</h3></div></div><div className="metric-switch" role="group" aria-label={t('Тип показателя')}><button type="button" className={volumeMode==='weight'?'selected':''} aria-pressed={volumeMode==='weight'} onClick={()=>setVolumeMode('weight')}>{t('Вес (кг)')}</button><button type="button" className={volumeMode==='volume'?'selected':''} aria-pressed={volumeMode==='volume'} onClick={()=>setVolumeMode('volume')}>{t('Объём (кг × повт.)')}</button></div>{muscleData.length?<div className="chart tall"><ResponsiveContainer width="100%" height="100%"><BarChart data={muscleData} layout="vertical" margin={{left:12,right:18}}><CartesianGrid horizontal={false} stroke="#edf0eb"/><XAxis type="number" tickLine={false} axisLine={false}/><YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={74}/><Tooltip/><Bar dataKey={volumeMode==='weight'?'weight':'volume'} name={t(volumeMode==='weight'?'Макс. вес (кг)':'Объём (кг × повт.)')} fill="#f6aa7e" radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>:<EmptyState icon={BarChart3} title={t('Пока нет нагрузок')} subtitle={t('Объём по мышечным группам появится после тренировок за текущую неделю.')}/>}</section></div>
          <details className="panel info-panel"><summary>{t('Подробнее о расчётном объёме')}</summary><p>{t('Пример: 20 кг × 10 повторений = 200 кг расчётного объёма. Фактический вес снаряда — 20 кг. Общий объём суммирует расчётные значения всех подходов; упражнения без веса на него не влияют.')}</p><p>{t('За месяц:')} {n(stats.current.totalVolume)} {t('кг × повт.')}. {t('Ранее:')} {n(stats.previous.totalVolume)} {t('кг × повт.')}.</p></details>
        </>}

        {view==='templates'&&<>
          <div className="page-heading"><div><div className="overline">{t('ПОВТОРЯЙТЕ УДОБНО')}</div><h1>{t('Шаблоны занятий')}<span className="dot-end">.</span></h1><p>{t('Сохраняйте удачные тренировки и запускайте их снова.')}</p></div><button className="btn btn-primary" onClick={()=>go('journal')}><ClipboardList size={17}/> {t('Открыть дневник')}</button></div>
          {!templates.length?<div className="panel"><EmptyState icon={BookOpen} title={t('Шаблонов пока нет')} subtitle={t('Создайте тренировку, а затем нажмите на значок сохранения рядом с записью.')} onClick={()=>go('journal')} action={t('Перейти в дневник')}/></div>:<div className="template-grid">{templates.map(template=><article className="template-card" key={template.id}><div className="template-icon"><BookOpen size={26}/></div><span className="category">{t('ШАБЛОН ТРЕНИРОВКИ')}</span><h3>{display(template.name)}</h3><p>{display(template.sportType)}</p><div className="template-data"><span>{template.sets.length} {language==='en'?'sets':'подходов'}</span><span>{template.durationMinutes} {language==='en'?'min':'мин'}</span></div><div className="template-bottom"><button className="btn btn-primary" onClick={()=>openWorkout(template)}>{t('Использовать')} <ArrowRight size={16}/></button><button className="icon-button danger" title={t('Удалить шаблон')} onClick={()=>deleteTemplate(template.id)}><Trash2 size={19}/></button></div></article>)}</div>}
        </>}
        </>}
        <footer><span>{t('FitProgress © 2026 · Учебный проект')}</span><span>{t('Данные привязаны к вашему аккаунту в PostgreSQL')} <ArrowDownRight size={13}/></span></footer>
      </div>
    </main>
  </div>;
}
