import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, CheckCircle2, Pencil, Plus, Save, Scale, Trash2, X } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from './api';
import { fmtDate, fmtNumber, tr, type Language } from './i18n';
import type { BodyWeightEntry } from './types';

type Props={language:Language};
const today=()=>new Date().toLocaleDateString('en-CA');

export function BodyWeightPage({language}:Props){
  const [entries,setEntries]=useState<BodyWeightEntry[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [editingId,setEditingId]=useState<number|null>(null);
  const [date,setDate]=useState(today());
  const [kg,setKg]=useState('');
  const [note,setNote]=useState('');
  const [showForm,setShowForm]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const t=(key:string)=>tr(language,key);
  const n=(value:number)=>fmtNumber(language,value);
  const unit=language==='en'?'kg':'кг';
  useEffect(()=>{
    let active=true;
    api.bodyWeight().then(rows=>{if(active)setEntries(rows)}).catch(e=>{if(active)setError(e instanceof Error?e.message:t('Не удалось загрузить измерения'))}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[]);
  const timeline=useMemo(()=>[...entries].sort((a,b)=>a.measuredOn.localeCompare(b.measuredOn)).map(e=>({...e,date:fmtDate(language,e.measuredOn)})),[entries,language]);
  const difference=entries.length>1?Math.round((entries[0].weightKg-entries[1].weightKg)*100)/100:null;
  function reset(){setEditingId(null);setDate(today());setKg('');setNote('');setShowForm(false)}
  function editEntry(e:BodyWeightEntry){setEditingId(e.id);setDate(e.measuredOn);setKg(String(e.weightKg));setNote(e.note);setShowForm(true);setError('');window.scrollTo({top:0,behavior:'smooth'})}
  async function save(event:FormEvent){
    event.preventDefault();
    const parsed=Number(kg);
    if(!Number.isFinite(parsed)||parsed<=0){setError(t('Укажите корректное значение веса'));return}
    setSaving(true);setError('');setNotice('');
    try{
      const body={measuredOn:date,weightKg:parsed,note};
      if(editingId===null)await api.addBodyWeight(body);
      else await api.updateBodyWeight(editingId,body);
      setEntries(await api.bodyWeight());reset();setNotice(t('Измерение сохранено'));
    }catch(e){setError(e instanceof Error?t(e.message):t('Не удалось сохранить измерение'))}
    finally{setSaving(false)}
  }
  async function remove(id:number){
    if(!window.confirm(t('Удалить запись измерения?')))return;
    setError('');setNotice('');
    try{await api.deleteBodyWeight(id);setEntries(await api.bodyWeight());if(editingId===id)reset();setNotice(t('Измерение удалено'))}
    catch(e){setError(e instanceof Error?t(e.message):t('Не удалось удалить измерение'))}
  }
  return <div className="weight-page">
    <div className="page-heading"><div><div className="overline">{t('ЛИЧНЫЙ ЖУРНАЛ')}</div><h1>{t('Вес тела')}<span className="dot-end">.</span></h1><p>{t('Необязательные личные измерения: запись, история и изменения со временем.')}</p></div>
      <button type="button" className="btn btn-primary" onClick={()=>{if(showForm)reset();else{reset();setShowForm(true)}}}>{showForm?<X size={17}/>:<Plus size={17}/>} {t(showForm?'Закрыть':'Добавить измерение')}</button></div>
    <p className="weight-context">{t('Измерения могут естественно меняться со дня на день. Здесь нет обязательных целей или оценок.')}</p>
    {error&&<div className="alert" role="alert">{error}<button onClick={()=>setError('')}><X size={16}/></button></div>}
    {notice&&<div className="notice" role="status"><CheckCircle2 size={17}/>{notice}<button onClick={()=>setNotice('')}><X size={16}/></button></div>}
    {showForm&&<form className="panel form-panel weight-form" onSubmit={save}>
      <h3>{t(editingId===null?'Новое измерение':'Изменить измерение')}</h3>
      <div className="form-grid"><label>{t('Дата')}<input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label>
        <label>{t('Вес тела, кг')}<input type="number" min="0.01" max="1000" step="0.01" required placeholder="—" value={kg} onChange={e=>setKg(e.target.value)}/></label>
        <label className="wide">{t('Заметка (необязательно)')}<input maxLength={300} value={note} onChange={e=>setNote(e.target.value)} placeholder={t('Личная заметка')}/></label></div>
      <div className="form-actions"><button className="btn btn-primary" type="submit" disabled={saving}><Save size={17}/>{saving?t('Сохранение...'):t('Сохранить')}</button></div></form>}
    {loading?<div className="loading">{t('Загрузка...')}</div>:entries.length===0?
      <section className="panel weight-empty"><Scale size={27}/><h3>{t('Пока нет измерений')}</h3><p>{t('Если захотите, добавьте первую запись. Данные видны только вашему аккаунту.')}</p></section>:
      <><div className="weight-summary"><div className="panel weight-summary-item"><span>{t('Последняя запись')}</span><strong>{n(entries[0].weightKg)} {unit}</strong><small>{fmtDate(language,entries[0].measuredOn)}</small></div>
          <div className="panel weight-summary-item"><span>{t('Разница с предыдущей записью')}</span><strong>{difference===null?'—':`${difference>0?'+':''}${n(difference)} ${unit}`}</strong><small>{t('Сравнение двух последних измерений, без оценки')}</small></div></div>
       <section className="panel"><div className="panel-heading"><div><div className="overline">{t('ИСТОРИЯ ИЗМЕНЕНИЙ')}</div><h3>{t('График измерений')}</h3></div></div>
         <div className="chart weight-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={timeline}><CartesianGrid vertical={false} stroke="#ecf0eb"/><XAxis dataKey="date" tickLine={false} axisLine={false}/><YAxis tickLine={false} axisLine={false} width={50} domain={['auto','auto']}/><Tooltip formatter={(value)=>[`${n(Number(value))} ${unit}`,t('Вес тела')]}/><Line type="monotone" dataKey="weightKg" stroke="#2f7c63" strokeWidth={3} dot={{r:4}} activeDot={{r:6}} name={t('Вес тела')}/></LineChart></ResponsiveContainer></div>
       </section>
       <section className="panel weight-history"><div className="panel-heading"><div><div className="overline">{t('ВАШИ ЗАПИСИ')}</div><h3>{t('История измерений')}</h3></div></div>
        {entries.map(e=><div key={e.id} className="weight-history-row"><span className="date-chip"><CalendarDays size={14}/>{fmtDate(language,e.measuredOn)}</span><strong>{n(e.weightKg)} {unit}</strong><span className="weight-history-note">{e.note||'—'}</span><div className="weight-history-actions"><button type="button" className="icon-button" aria-label={t('Изменить измерение')} title={t('Изменить измерение')} onClick={()=>editEntry(e)}><Pencil size={17}/></button><button type="button" className="icon-button danger" aria-label={t('Удалить измерение')} title={t('Удалить измерение')} onClick={()=>void remove(e.id)}><Trash2 size={17}/></button></div></div>)}
       </section></>}
  </div>;
}
