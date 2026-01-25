
/**
 * (Opsional) Hitung Skor & Ranking di Spreadsheet
 * Mengambil data dari sheet 'ratings' (output backend v5)
 * dan menulis rekap ke sheet 'results'
 */
function fgHitungSkorRanking(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('ratings');
  if(!sh) throw new Error("Sheet 'ratings' belum ada.");

  const data = sh.getDataRange().getValues();
  if(data.length < 2) throw new Error("Data ratings kosong.");

  const header = data[0].map(h=>String(h||'').trim());
  const idx = (name)=> header.indexOf(name);

  const cEvent = idx('event_id');
  const cDate = idx('date');
  const cCompId = idx('competition_id');
  const cCompName = idx('competition_name');
  const cTeamId = idx('team_id');
  const cTeamName = idx('team_name');
  const cJudge = idx('judge_nik');
  const cWeight = idx('weight');
  const cRating = idx('rating');

  const req = [cEvent,cDate,cCompId,cTeamId,cJudge,cWeight,cRating];
  if(req.some(x=>x<0)) throw new Error("Kolom tidak lengkap. Pastikan header sesuai backend v5.");

  const map = {};
  for(let i=1;i<data.length;i++){
    const r = data[i];
    const key = [r[cEvent], r[cDate], r[cCompId], r[cTeamId]].join('|');
    if(!map[key]){
      map[key] = {
        event_id:r[cEvent], date:r[cDate],
        competition_id:r[cCompId], competition_name:r[cCompName],
        team_id:r[cTeamId], team_name:r[cTeamName],
        judges: new Set(),
        score: 0
      };
    }
    map[key].judges.add(String(r[cJudge]||''));
    map[key].score += (Number(r[cRating]||0) * (Number(r[cWeight]||0)/100));
  }

  const rows = Object.values(map).map(o=>({
    ...o,
    judge_count: o.judges.size
  }));

  rows.sort((a,b)=>b.score-a.score);

  let out = ss.getSheetByName('results');
  if(!out) out = ss.insertSheet('results');
  out.clear();
  out.getRange(1,1,1,7).setValues([['event_id','date','competition','team','score','judge_count','rank']]);

  const values = rows.map((o,i)=>[
    o.event_id, o.date, o.competition_name||o.competition_id, o.team_name||o.team_id,
    Number(o.score||0), o.judge_count, i+1
  ]);
  if(values.length) out.getRange(2,1,values.length,7).setValues(values);
}
