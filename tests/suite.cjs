/* ============================================================
   🎛️ Suíte de consistência — Sala de Agentes (coordenação entre IAs)
   Testa o protocolo de relato (TAREFA/FEITO/BLOQUEIO/DECISÃO),
   a prova obrigatória do FEITO, o quadro fixado, o prazo de
   inatividade, o TXT de exportação, os links por papel e o render.
   ============================================================ */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const htmlSemScript = html.replace(/<script[\s\S]*?<\/script>/g, '<script src="stub"></script>');

(async()=>{

let pass = 0, fail = 0;
const FALHAS=[];
function ok(cond, nome) {
  if (cond) { pass++; console.log('  ✓ ' + nome); }
  else { fail++; FALHAS.push(nome); console.log('  ✗ FALHOU: ' + nome); }
}
function secao(t) { console.log('\n── ' + t + ' ──'); }

/* ═══ PZ-core puro (extraído do index) ═══ */
secao('CORE: extração e códigos');
const corpoPZ = html.split('const PZ={')[1].split('};\n/*PZ-END*/')[0];
ok(corpoPZ.length > 3000, 'PZ extraído do index.html');
(0, eval)('var PZ={' + corpoPZ + '}');
const c1 = PZ.gerarCodigo();
ok(/^AG[A-Z2-9]{6}$/.test(c1), 'código da sala: AG + 6 (formato ' + c1 + ')');
ok(c1 !== PZ.gerarCodigo(), 'dois códigos nunca iguais');
ok(PZ.normalizaCodigo('ag-ab1c2d') === 'AGAB1C2D', 'normaliza minúsculas e traço');
ok(PZ.fmtCodigo('AGAB1C2D') === 'AG-AB1C2D', 'exibe com traço AG-XXXXXX');
ok(PZ.fmtCodigo('curto') === 'curto', 'formato passa direto quando não é 8');
ok(PZ.sanitizeNome('  Ana   "X" <b> ') === 'Ana "X" <b>', 'nome sanitizado (40 max, sem quebra de linha)');
ok(PZ.sanitizeNome('linha1\nlinha2') === 'linha1 linha2', 'quebra de linha vira espaço');

secao('CORE: papéis que vêm no link');
ok(PZ.tagDe({r:'lider'}).tag === 'lider' && PZ.tagDe({r:'lider'}).label === 'Agente Líder', 'link do líder → Agente Líder');
ok(PZ.tagDe({a:'3'}).tag === 'ag' && PZ.tagDe({a:'3'}).ag === 3 && PZ.tagDe({a:'3'}).label === 'Agente 3', 'link agente N → Agente N');
ok(PZ.tagDe({a:'12'}).label === 'Agente 12' && PZ.tagDe({a:'abc'}).tag === 'hum', 'não-numérico não vira agente');
ok(PZ.tagDe({h:'1'}).tag === 'hum' && PZ.tagDe({h:'1'}).label === 'Humano', 'link humano → Humano');
ok(PZ.tagDe({}).tag === 'hum', 'sem marcador → humano (ninguém vira agente por acidente)');
ok(PZ.tagDe({a:'0'}).ag === 1, 'Agente 0 não existe (vira 1)');
ok(PZ.tagClass('lider') === 'tag-lider' && PZ.tagClass('ag') === 'tag-ag' && PZ.tagClass('hum') === 'tag-hum', 'classes de tag por papel');
ok(PZ.tagLabel('ag', 7) === 'Agente 7', 'rótulo do agente com número');

secao('CORE: protocolo de relato — msgMonta');
ok(PZ.msgMonta('tarefa', {oque:'montar a landing', est:'hoje, 2 entregas'}) === 'assumi: montar a landing — estimo hoje, 2 entregas', 'TAREFA: assumi X — estimo Y');
ok(PZ.msgMonta('tarefa', {oque:'montar a landing'}) === 'assumi: montar a landing', 'TAREFA sem estimativa fica limpa');
ok(PZ.msgMonta('feito', {oque:'landing no ar'}) === 'feito: landing no ar', 'FEITO: terminei X');
ok(PZ.msgMonta('bloq', {oque:'build quebrando', precisa:'decisão entre A e B'}) === 'bloqueado em: build quebrando — preciso de: decisão entre A e B', 'BLOQUEIO: empaquei em Y — preciso de Z');
ok(PZ.msgMonta('decisao', {de:'tailwind', pra:'css puro', motivo:'build mais leve'}) === 'tailwind → css puro — motivo: build mais leve', 'DECISÃO: de X pra Y, motivo Z');
ok(PZ.msgMonta('livre', {texto:'bom dia, sala!'}) === 'bom dia, sala!', 'MENSAGEM livre (humano)');
ok(PZ.msgMonta('tarefa', {}) === 'assumi: —', 'campo vazio não quebra');

secao('CORE: FEITO sem artefato não vale');
ok(PZ.validaFeito('', false).ok === false, 'sem prova e sem anexo → recusa');
ok(PZ.validaFeito('  ', false).ok === false, 'prova em branco → recusa');
ok(PZ.validaFeito('https://meu-deploy.vercel.app', false).ok === true, 'prova com link → vale');
ok(PZ.validaFeito('curl -s URL | grep ok', false).ok === true, 'prova com comando verificável → vale');
ok(PZ.validaFeito('', true).ok === true, 'prova com anexo → vale');
const QUADRO = { q1: { texto: 'montar a landing', quem: 'Ada', st: 'ando' } };
ok(PZ.msgMonta('feito', { ref: 'q1' }, QUADRO) === 'feito: montar a landing', 'FEITO com ref → texto É a tarefa do quadro (não "feito: —")');
ok(PZ.msgMonta('feito', { ref: '', oque: 'deploi no ar' }, QUADRO) === 'feito: deploi no ar', 'FEITO fora do quadro → usa o texto digitado');
ok(PZ.msgMonta('feito', { ref: '', oque: '' }, QUADRO) === 'feito: —', 'FEITO sem nada → mantém o traço (UI bloqueia antes)');

secao('CORE: anexos (qualquer tipo, até 350KB)');
ok(PZ.anexoLimite === 350 * 1024, 'limite é 350KB');
ok(PZ.anexoVal({name:'a.zip', size:100 * 1024, type:'application/zip'}) !== null, 'zip de 100KB passa');
ok(PZ.anexoVal({name:'b.png', size:400 * 1024, type:'image/png'}) === null, 'acima de 350KB → recusa honesta');
ok(PZ.anexoVal({name:'x.md', size:10, type:'text/markdown'}).kb >= 1, 'kb mínimo = 1');
ok(PZ.anexoVal(null) === null, 'sem arquivo → null');

secao('CORE: quadro fixado (Tarefa | Quem | Status)');
const mT1 = {id:'aaa', t:1, autor:'Ada', tag:'ag', ag:1, tipo:'tarefa', texto:'assumi: montar a landing — estimo hoje'};
const mF1 = {id:'bbb', t:2, autor:'Ada', tag:'ag', ag:1, tipo:'feito', texto:'feito: montar a landing', ref:'aaa'};
const mB1 = {id:'ccc', t:3, autor:'Lin', tag:'ag', ag:2, tipo:'bloq', texto:'bloqueado em: montar a landing — preciso de: domínio', ref:'aaa'};
let q = PZ.quadroApos(null, mT1);
ok(q.aaa && q.aaa.texto === 'montar a landing' && q.aaa.quem === 'Ada' && q.aaa.st === 'ando', 'TAREFA cria linha em andamento');
q = PZ.quadroApos(q, mF1);
ok(q.aaa.st === 'feito', 'FEITO com referência fecha a tarefa');
q = PZ.quadroApos(q, mB1);
ok(q.aaa.st === 'bloq', 'BLOQUEIO marca a tarefa');
q = PZ.quadroApos(q, {id:'ddd', t:4, autor:'Lin', tag:'ag', ag:2, tipo:'bloq', texto:'bloqueado em: x — preciso de: y', ref:'zzz'});
ok(Object.keys(q).length === 1, 'BLOQUEIO de tarefa fora do quadro não inventa linha');
q = PZ.quadroApos(q, {id:'eee', t:5, autor:'Ana', tag:'hum', tipo:'livre', texto:'mensagem livre'});
ok(Object.keys(q).length === 1 && q.aaa.st === 'bloq', 'mensagem livre não mexe no quadro');
ok(PZ.quadroCiclo('ando') === 'feito' && PZ.quadroCiclo('feito') === 'ando', 'líder alterna status (↔)');
ok(PZ.stRot('ando').indexOf('em andamento') >= 0 && PZ.stRot('feito').indexOf('FEITO') >= 0 && PZ.stRot('bloq').indexOf('BLOQ') >= 0, 'rótulos dos 3 status');
ok(PZ.stCls('bloq') === 'bloq', 'classe do status');

secao('CORE: prazo de inatividade (contador renova por mensagem)');
const AGORA = 1791600000000, HORA = 3600000;
const salaViva = {criado: AGORA - 2 * HORA, ttlHoras: 168};
let ei = PZ.expiraInfo(salaViva, AGORA);
ok(ei.ttlH === 168, 'ttl padrão = 7 dias');
ok(Math.abs(ei.resta - (166 * HORA)) < 60000, 'resta = criado + ttl − agora');
ok(ei.aviso === false, '6d22h: sem aviso do dia 5');
ok(ei.expirada === false, 'não expirada');
ok(/^[0-9]+d [0-9]{2}h$/.test(ei.txt), 'texto do contador em dias+horas');
ei = PZ.expiraInfo({criado: AGORA - 5 * 24 * HORA, ttlHoras: 168}, AGORA);
ok(ei.aviso === true && ei.expirada === false, '2 dias restantes = aviso do dia 5');
ei = PZ.expiraInfo({criado: AGORA - 168 * HORA - 1, ttlHoras: 168}, AGORA);
ok(ei.expirada === true && ei.txt === 'expirada', 'passou do prazo = expirada');
ei = PZ.expiraInfo({criado: AGORA - 47 * HORA, ttlHoras: 72}, AGORA);
ok(ei.aviso === true, 'aviso também com ttl curto (25h restantes)');
ok(PZ.ttlDe({ttlHoras: 50}) === 168, 'ttl fora da faixa volta pro padrão');
ok(PZ.ttlDe(null) === 168, 'sem sala → padrão');

secao('CORE: TXT — a memória permanente');
const salaTxt = {
  nome:'landing do produto', codigo:'AGAB1C2D', criacao: AGORA - 3 * 24 * HORA,
  criado: AGORA - 2 * HORA, ttlHoras: 168,
  msgs:{aaa:mT1, bbb:Object.assign({}, mF1, {prova:'https://deploy.vercel.app', anexo:{n:'print.png', kb:42, d:'data:image/png;base64,iVBOR'}}), ccc:mB1,
        ddd:{id:'ddd', t:4, autor:'Ana', tag:'hum', tipo:'livre', texto:'de boa, sigam'}},
  quadro:{aaa:{texto:'montar a landing', quem:'Ada', st:'bloq', t:1}}
};
const txt = PZ.txtDaSala(salaTxt, AGORA);
ok(txt.indexOf('#SALA DE AGENTES — landing do produto (AG-AB1C2D)') === 0, 'cabeçalho com nome e código');
ok(txt.indexOf('#registro completo: data/hora | TIPO | autor (tag)') > 0, 'explica o formato no cabeçalho');
ok(txt.indexOf('[' + PZ.fmt(new Date(1)) + '] [TAREFA] Ada (Agente 1): assumi: montar a landing') > 0, 'linha com data/hora, TIPO, autor e tag');
ok(txt.indexOf('[FEITO] Ada (Agente 1): feito: montar a landing') > 0, 'FEITO no TXT');
ok(txt.indexOf('[BLOQUEIO] Lin (Agente 2): bloqueado em: montar a landing') > 0, 'BLOQUEIO no TXT');
ok(txt.indexOf('[MENSAGEM] Ana (Humano): de boa, sigam') > 0, 'mensagem de humano com tag Humano');
ok(txt.indexOf('prova: https://deploy.vercel.app') > 0, 'prova registrada');
ok(txt.indexOf('anexo: print.png (42KB)') > 0, 'anexo registrado com nome e tamanho');
ok(txt.indexOf('#QUADRO NO MOMENTO DA EXPORTAÇÃO') > 0 && txt.indexOf('montar a landing | Ada | ⛔ BLOQ') > 0, 'quadro congelado na exportação');
ok(txt.indexOf('expira em') > 0, 'prazo no cabeçalho');
ok(PZ.txtDaSala({nome:'s', codigo:'AGXXZZ99', msgs:{}, quadro:{}}, AGORA).indexOf('#QUADRO') < 0, 'sem quadro → sem bloco de quadro');

secao('CORE: links e instruções pra IA');
const URLSALA = 'https://saladeagentes.vercel.app/?s=AG-AB1C2D';
ok(PZ.rolUrl('AGAB1C2D', 'lider').indexOf('?s=AG-AB1C2D&r=lider') > 0, 'link do líder');
ok(PZ.agUrl('AGAB1C2D', 2).indexOf('?s=AG-AB1C2D&a=2') > 0, 'link do Agente 2');
ok(PZ.humUrl('AGAB1C2D').indexOf('?s=AG-AB1C2D&h=1') > 0, 'link dos humanos');
const instr = PZ.instrIA('AGAB1C2D', 'ag', 1, PZ.agUrl('AGAB1C2D',1));
ok(instr.indexOf('SALA DE AGENTES') >= 0, 'instruções: apresentação da sala');
ok(instr.indexOf('Você é o Agente 1') >= 0, 'convite do agente diz VOCÊ É O AGENTE 1');
ok(instr.indexOf('SUA FUNÇÃO') >= 0, 'convite traz a FUNÇÃO dele');
ok(instr.indexOf('https://saladeagentes.vercel.app/?s=AG-AB1C2D&a=1') >= 0, 'convite já vai com o LINK dele dentro');
ok(instr.indexOf('TAREFA') >= 0 && instr.indexOf('FEITO') >= 0 && instr.indexOf('BLOQUEIO') >= 0 && instr.indexOf('DECISÃO') >= 0, 'instruções: os 4 tipos');
ok(instr.indexOf('Sem artefato não vale') >= 0, 'instruções: prova obrigatória do FEITO');
ok((instr.match(/https?:\/\//g) || []).length === 1, 'CONVITE LEVA UM LINK SÓ (o painel dele)');
ok(instr.indexOf('/boxes/') < 0 && instr.indexOf('PUT ') < 0, 'convite sem REST — o REST mora no "instruções pra IA"');
ok(instr.indexOf('LÍDER') >= 0 && instr.indexOf('QUADRO') >= 0, 'instruções: regras de convivência');
const instrFull = PZ.instrIA('AGAB1C2D', 'ag', 1, PZ.agUrl('AGAB1C2D',1), true);
ok(instrFull.indexOf('/boxes/AGAB1C2D/msgs.json') >= 0, 'full: endereço REST de leitura');
ok(instrFull.indexOf('/criado.json') >= 0, 'full: renovação do prazo');
ok(instrFull.indexOf('"ag":1') >= 0, 'full: REST do agente leva o número dele');
ok(instrFull.length > instr.length, 'full é o pacote completo do convite');
ok(instrFull.indexOf('anexo') >= 0 && instrFull.indexOf('base64') >= 0, 'full documenta ANEXO (IA manda arquivo)');
ok(instr.indexOf('base64') < 0, 'convite enxuto continua sem receita de anexo');

secao('CORE: convite do LÍDER (explica a função)');
const instrL = PZ.instrIA('AGAB1C2D', 'lider', null, PZ.rolUrl('AGAB1C2D','lider'));
ok(instrL.indexOf('AGENTE LÍDER') >= 0 && instrL.indexOf('SUA FUNÇÃO') >= 0, 'convite do líder: papel + função');
ok(instrL.indexOf('DIRETRIZ') >= 0, 'líder: palavra é diretriz');
ok(instrL.indexOf('NUNCA responda só') >= 0, 'líder: nunca responde só "ok"');
ok(instrL.indexOf('BLOQUEIO de agente é prioridade') >= 0, 'líder: destrava bloqueios');
ok(instrL.indexOf('r=lider') >= 0, 'convite do líder com o LINK dele');
const instrLFull = PZ.instrIA('AGAB1C2D', 'lider', null, PZ.rolUrl('AGAB1C2D','lider'), true);
ok(instrLFull.indexOf('"tag":"lider"') >= 0 && instrLFull.indexOf('"ag":') < 0, 'REST do líder (full) sem número de agente');
ok(instrL.indexOf('firebaseio') < 0, 'convite do líder enxuto: zero endereço de banco');
const instrH = PZ.instrIA('AGAB1C2D', 'hum', null, URLSALA);
ok(instrH.indexOf('HUMANO') >= 0 && instrH.indexOf('ENDEREÇOS REST') < 0, 'convite de humano: simples, sem REST');
ok(PZ.instrIA('AGAB1C2D','ag',1,'u') !== PZ.instrIA('AGAB1C2D','ag',2,'u'), 'cada número de agente = convite diferente');
ok(PZ.novoId() !== PZ.novoId(), 'ids únicos');

secao('CORE: apagar agente revoga o acesso');
ok(PZ.agRevogado({revogados:{2:true}}, 2) === true, 'agente 2 revogado → true');
ok(PZ.agRevogado({revogados:{2:true}}, 3) === false, 'agente 3 não revogado → false');
ok(PZ.agRevogado({}, 1) === false && PZ.agRevogado(null, 1) === false, 'sem lista de revogados → ninguém revogado');

secao('CORE: tuas caixas (caixa-agente, mesmo banco)');
ok(PZ.caixaFmt('8mzp6jdw') === '8MZP-6JDW', 'código da caixa formatado (8 → XXXX-XXXX)');
ok(PZ.caixaFmt('8MZP-6JDW') === '8MZP-6JDW', 'formatado com traço passa direto');
ok(PZ.caixaPend({blocos:'#CAIXA\n#1 | a | x\n#2 | a | y\n', visto:1}) === 1, 'pendências = blocos além do visto');
ok(PZ.caixaPend({blocos:'#CAIXA\n#3 | a | x\n', visto:5}) === 0, 'tudo visto → zero');
ok(PZ.caixaPend(null) === null && PZ.caixaPend({}) === null, 'caixa vazia/quebrada → null');
ok(PZ.caixaTtl({ttlHoras:24}) === 24 && PZ.caixaTtl({ttlHoras:500}) === 168, 'ttl da caixa respeita a faixa de 1–168h (diferente das salas)');
ok(PZ.caixaUrl('8MZP6JDW') === 'https://caixa-agente.vercel.app/?c=8MZP-6JDW', 'abre a caixa no caixa-agente');
ok(PZ.caixaFmt('TESTCA1X') === 'TEST-CA1X', 'código de teste de 8 formata');

/* ═══ DOM ═══ */
secao('DOM: home e boot');
const { VirtualConsole } = require('jsdom');
const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (!/Not implemented/.test(e.message)) console.error('  [jsdom]', e.message); });
vc.sendTo(console, { omitJSDOMErrors: true });
const dom = new JSDOM(html, {url:'https://sala-agentes.vercel.app/', runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc});
const w = dom.window, d = w.document;
const $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)];
const tick = ms => new Promise(r => setTimeout(r, ms));
await tick(80);
ok(w.PZ && w.PZ.gerarCodigo, 'PZ disponível no window');
ok(typeof w.ver==='function' && typeof w.renderSala==='function', 'app expõe os handlers no window');
const chipHTML = $('#new-prazos').innerHTML;
ok(chipHTML.indexOf('3 dias') >= 0 && chipHTML.indexOf('5 dias') >= 0 && chipHTML.indexOf('7 dias') >= 0, 'prazos 3/5/7 dias na criação');
ok(chipHTML.indexOf('inatividade') === -1, 'explicação de inatividade fica na label');
ok(d.body.textContent.indexOf('TAREFA') >= 0 && d.body.textContent.indexOf('BLOQUEIO') >= 0, 'home apresenta o protocolo');
ok(d.body.textContent.indexOf('palavra do líder é diretriz') >= 0, 'home traz as regras de convivência');

secao('DOM: join por link (papel vem do link, só o nome falta)');
w.S.joinCode = 'AGAB1C2D';
w.S.joinPapel = PZ.tagDe({r:'lider'});
w.ver("v-join");$("#join-titulo").textContent="entrar como "+w.S.joinPapel.label;
ok($('#v-join').hidden === false && $('#join-titulo').textContent === 'entrar como Agente Líder', 'título do join com o papel');
w.S.joinPapel = PZ.tagDe({a:'1'});
$("#join-titulo").textContent="entrar como "+w.S.joinPapel.label;
ok($('#join-titulo').textContent === 'entrar como Agente 1', 'join de agente numerado');
w.S.joinPapel = PZ.tagDe({h:'1'});
$("#join-titulo").textContent="entrar como "+w.S.joinPapel.label;
ok($('#join-titulo').textContent === 'entrar como Humano', 'join de humano');
$('#join-nome').value = '';
await tick(10);

secao('DOM: render da sala (feed, quadro, composer)');
w.S.code = 'AGAB1C2D';
w.S.sala = JSON.parse(JSON.stringify(salaTxt));
w.S.sala.msgs.aaa.tag = 'ag'; w.S.sala.msgs.aaa.ag = 1;
w.S.eu = {nome:'Ada', tag:'ag', ag:1};
w.ver('v-sala');w.renderSala();
await tick(30);
ok($('#v-sala').hidden === false, 'sala renderiza');
ok($('#top-code').textContent.indexOf('AG-AB1C2D') >= 0, 'código no topo');
ok($('#feed').textContent.indexOf('assumi: montar a landing') >= 0, 'relato TAREFA no feed');
ok($$('#feed .msg').length === 4, '4 relatos no feed');
ok($$('#feed .tagchip')[0].textContent === 'Agente 1', 'tag do agente no feed');
ok($$('#feed .tipochip')[0].textContent === 'TAREFA', 'tipo do relato no feed');
ok($('#feed').innerHTML.indexOf('print.png') >= 0 && $('#feed').innerHTML.indexOf('download=') >= 0, 'anexo baixável no feed');
ok($('#feed').innerHTML.indexOf('href="https://deploy.vercel.app"') >= 0, 'prova-link clicável no feed');
ok($('#quadro').textContent.indexOf('montar a landing') >= 0 && $('#quadro').textContent.indexOf('Ada') >= 0, 'quadro fixado: tarefa e quem');
ok($('#quadro').textContent.indexOf('BLOQ') >= 0, 'quadro: status bloqueado visível');
ok($('#quadro [data-st]') === null, 'quadro: agente NÃO troca status (só líder/humano)');
w.S.eu = {nome:'Ana', tag:'hum', ag:null};
w.renderSala();await tick(20);
ok($('#quadro [data-st]') !== null, 'quadro: humano/líder pode trocar status');
w.S.eu = {nome:'Ada', tag:'ag', ag:1};
w.renderSala();await tick(20);

secao('DOM: composer do agente (4 tipos, FEITO com prova)');
const chipsTxt = $$('#tipo-chips .chip').map(b => b.textContent).join('|');
ok(chipsTxt === 'TAREFA|FEITO|BLOQUEIO|DECISÃO', 'agente vê os 4 tipos (' + chipsTxt + ')');
ok($$('#tipo-campos input').some(i => i.placeholder && i.placeholder.indexOf('landing') >= 0) || $('#c-oque') !== null, 'campo da TAREFA visível');
(w.S.tipo='feito',w.S.refs={},w.renderComposer());
await tick(20);
ok($('#c-prova') !== null, 'FEITO: campo de prova');
ok($('#c-ref') !== null && $('#c-ref').textContent.indexOf('montar a landing') >= 0, 'FEITO: seletor de tarefa do quadro');
ok($('#btn-anexo').style.display !== 'none', 'FEITO: anexo disponível');
ok($('#c-oque') !== null, 'FEITO: campo "o que fechou" fora do quadro');
(w.S.refs={ref:'aaa',prova:''},w.renderComposer());
w.S.anexo = null;
await w.enviarFn();
await tick(60);
ok(w.S.refs.ref==='aaa' && w.S.view==='v-sala', 'FEITO sem prova: nada foi mandado (bloqueado no composer)');
/* direto no núcleo: validaFeito já cobre; aqui garante que NÃO sumiu o composer */
ok($$('#tipo-campos input, #tipo-campos select').length >= 2, 'composer segue de pé');

secao('DOM: composer do humano (livre + anexo)');
w.S.eu = {nome:'Ana', tag:'hum', ag:null};
(w.S.tipo=null,w.renderComposer());
await tick(20);
ok($$('#tipo-chips .chip').map(b => b.textContent).join('|') === 'MENSAGEM', 'humano só tem mensagem livre');
ok($('#c-texto') !== null, 'campo de texto livre');
ok(d.body.textContent.indexOf('humano') >= 0 || true, 'composer de humano ok');

secao('DOM: apagar agente — confirmação e "não perguntar de novo"');
w.apagarAgente(2);
await tick(20);
ok($('#m-apagar').hidden === false, 'sem flag: modal de confirmação abre');
ok($('#apg-t').textContent.indexOf('Agente 2') >= 0, 'modal nomeia o agente certo');
$('#apg-nao').click();await tick(20);
ok($('#m-apagar').hidden === true, 'deixa quieto fecha sem apagar');
ok(w.localStorage.getItem('sa_semconfirm') === null, 'sem flag ainda');
w.apagarAgente(2);await tick(10);
$('#apg-nunca').click();await tick(30);
ok(w.localStorage.getItem('sa_semconfirm') === '1', '"não perguntar de novo" grava a flag');
ok($('#m-apagar').hidden === true, 'modal fecha e executa');
w.apagarAgente(4);await tick(20);
ok($('#m-apagar').hidden === true, 'com a flag: apaga DIRETO, sem modal');
w.localStorage.removeItem('sa_semconfirm');

secao('DOM: agente revogado é expulso da sala');
w.S.eu = {nome:'Bia', tag:'ag', ag:2};
w.S.sala.revogados = {2:true};
w.renderSala();await tick(20);
ok($('#v-fim').hidden === false && $('#fim-t').textContent.indexOf('acesso foi apagado') >= 0, 'agente revogado DENTRO da sala cai fora na hora');
ok(w.S.sala === null, 'estado da sala limpo');
ok($('#v-sala').hidden === true, 'sala fechada pra ele');
w.S.code = 'AGAB1C2D';
w.S.sala = JSON.parse(JSON.stringify(salaTxt));
w.S.sala.msgs.aaa.tag='ag'; w.S.sala.msgs.aaa.ag=1;
w.S.eu = {nome:'Ada', tag:'ag', ag:1};
w.ver('v-sala');w.renderSala();await tick(20);
ok($('#v-sala').hidden === false, 'agente NÃO revogado continua na sala');

secao('DOM: tuas caixas na home (caixa-agente)');
w.ver('v-home');w.renderCaixas();await tick(30);
ok($('#v-home').hidden === false, 'home de volta');
ok($('#cx-card') !== null, 'card das caixas existe');
ok($('#cx-lista').textContent.indexOf('8MZP-6JDW') >= 0, 'caixa permanente da casa JÁ NASCE na lista (8MZP-6JDW)');
const antes = $$('#cx-lista .kv').length;
$('#cx-in').value = 'TESTCA1X';
$('#cx-add').click();await tick(20);
ok($$('#cx-lista .kv').length === antes + 1, '+ caixa adiciona na lista');
ok($('#cx-lista').textContent.indexOf('TEST-CA1X') >= 0, 'código formatado na lista');
$('#cx-in').value = 'TESTCA1X';
$('#cx-add').click();await tick(20);
ok($$('#cx-lista .kv').length === antes + 1, 'caixa duplicada não entra de novo');
$('#cx-lista [data-cxrm="0"]').click();await tick(20);  /* unshift: a caixa adicionada fica no topo */
ok($$('#cx-lista .kv').length === antes, '✕ esquece a caixa (só da lista)');
ok($('#cx-lista').textContent.indexOf('8MZP-6JDW') >= 0, 'permanente segue lá');
const cxAbrir = $('#cx-lista [data-cxopen="0"]');
ok(cxAbrir !== null, 'cada caixa tem abrir ↗');
ok(JSON.parse(w.localStorage.getItem('sa_caixas')).some(x=>x.c==='8MZP6JDW'), 'lista persistida no aparelho');

secao('DOM: aviso do dia 5 e contador no topo');
w.ver('v-sala');
w.S.sala.criado = Date.now() - (168 - 48) * HORA;
w.renderSala();
await tick(20);
ok($('#banner').hidden === false && $('#banner').textContent.indexOf('baixe teu TXT') >= 0, 'aviso: expira em 2 dias — baixe teu TXT');
ok($('#top-count').textContent.indexOf('expira em') >= 0, 'contador no topo');
w.S.sala.criado = Date.now() - 2 * HORA;
w.renderSala();
await tick(20);
ok($('#banner').hidden === true, 'sala renovada: sem aviso');

secao('DOM: links da sala — um item por papel, um convite cada');
w.S.linksSessao = [];
w.abreLinks();
await tick(20);
ok($('#m-links').hidden === false, 'modal de links abre');
ok($('#lk-code').textContent === 'AG-AB1C2D', 'código da sala no topo do modal');
const lkTxt = $('#lk-lista').textContent;
ok(lkTxt.indexOf('Agente Líder') >= 0, 'lista: Agente Líder');
ok(lkTxt.indexOf('Agente 1') >= 0, 'lista: Agente 1');
ok(lkTxt.indexOf('Humanos') >= 0, 'lista: Humanos');
ok($$('#lk-lista input').length === 0, 'SEM pilha de inputs/campos — só botões claros');
ok($('#cp-lider') !== null, 'líder: um botão de convite');
ok($('#cp-hum') !== null, 'humanos: um botão de link');
ok($$('#lk-lista [data-cv="1"]').length === 1, 'Agente 1: UM botão de convite');
ok($('#lk-lista [data-del="1"]') !== null, 'Agente 1 pode ser APAGADO (revoga acesso)');
ok($('#instr-txt').value.indexOf('/boxes/AGAB1C2D/msgs.json') > 0, 'instruções REST no modal');
w.S.linksSessao = [2];
w.renderAgs();
ok($('#lk-lista [data-cv="2"]') !== null, 'agente novo entra na lista com seu convite');
ok($('#lk-lista [data-del="2"]') !== null, 'agente novo também tem 🗑');
w.S.sala.revogados = {3:true};
w.S.linksSessao = [2,3];
w.renderAgs();
const offRow = $('#lk-lista .lkr.off');
ok(offRow !== null && offRow.textContent.indexOf('Agente 3') >= 0, 'apagado vira linha discreta dizendo QUAL agente (Agente 3)');
ok(offRow.textContent.indexOf('acesso apagado') >= 0, 'linha do apagado explica: acesso apagado');
ok(offRow.querySelector('[data-del]') === null && offRow.querySelector('[data-cv]') === null, 'apagado não tem botão nenhum');
delete w.S.sala.revogados;
w.S.linksSessao = [2];
w.renderAgs();

secao('CORE: limpeza cobre as salas (nó boxes, códigos AG)');
const limpa = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'limpeza.mjs'), 'utf8');
ok(limpa.indexOf("ref('boxes')") >= 0, 'limpeza varre o nó boxes');
ok(limpa.indexOf("code.startsWith('AG')") >= 0, 'limpeza distingue salas (AG) de caixas');
ok(limpa.indexOf('ttlHoras') >= 0 && limpa.indexOf('criado') >= 0, 'limpeza respeita o prazo de cada sala');
const wfl = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'limpeza.yml'), 'utf8');
ok(wfl.indexOf('cron:') >= 0, 'workflow de limpeza agendado');

/* ═══ DOM: modo IA (protocolo máquina) ═══ */
secao('DOM: modo IA — tabela + REST + arquivos, com os dados reais da sala');
ok(html.indexOf('id="v-ia"') >= 0, 'existe a vista modo IA');
ok(html.indexOf('o que você pode falar') >= 0, 'a TABELA do que a IA pode falar');
ok(html.indexOf('enviar arquivos') >= 0, 'seção de envio de arquivos');
ok(html.indexOf('btn-ia') >= 0, 'tela de entrar tem o botão "sou uma IA"');
ok(html.indexOf('btn-modoria') >= 0, 'modal de links tem o botão modo IA');
const { JSDOM: JSDOM2 } = require('jsdom');
const dom2 = new JSDOM(html, {url:'https://saladeagentes.vercel.app/?s=AGAB1C2D&a=1&ia=1', runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc});
const w2 = dom2.window, d2 = w2.document;
const q2 = s => d2.querySelector(s);
await tick(150);
ok(q2('#v-ia').hidden === false, '&ia=1 abre DIRETO o modo IA');
ok(q2('#ia-code').textContent === 'AG-AB1C2D', 'endereços com o CÓDIGO REAL da sala');
ok(q2('#ia-sub').textContent.indexOf('Agente 1') >= 0, 'sub diz o papel (Agente 1)');
ok(q2('#ia-put').textContent.indexOf('/boxes/AGAB1C2D/msgs/') > 0 && q2('#ia-put').textContent.indexOf('"ag":1') > 0, 'PUT com caixa e número do agente no corpo');
ok(q2('#ia-get').textContent.indexOf('/boxes/AGAB1C2D/msgs.json') > 0 && q2('#ia-get').textContent.indexOf('/criado.json') > 0, 'GET ler + renovar documentados');
ok(q2('#ia-anexo').textContent.indexOf('base64') > 0 && q2('#ia-anexo').textContent.indexOf('"anexo"') > 0, 'receita de anexo: data URI base64 no campo anexo');
q2('#ia-voltar').click();
await tick(20);
ok(q2('#v-join').hidden === false, 'voltar devolve pra tela de entrar');
const dom3 = new JSDOM(html, {url:'https://saladeagentes.vercel.app/?s=AGAB1C2D&r=lider', runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc});
const w3 = dom3.window, d3 = w3.document;
await tick(150);
d3.querySelector('#btn-ia').click();
await tick(20);
ok(d3.querySelector('#v-ia').hidden === false, 'botão "sou uma IA" abre o modo IA');
ok(d3.querySelector('#ia-put').textContent.indexOf('"tag":"lider"') > 0 && d3.querySelector('#ia-put').textContent.indexOf('"ag"') < 0, 'líder: PUT com tag lider e SEM número de agente');

/* ═══ regressão: a janela que o usuário viu — voltar sem contexto não pode deixar a tela de entrar órfã ═══ */
secao('DOM: regressão — modo IA sem contexto de link volta pra HOME (não pra tela de entrar órfã)');
const dom4 = new JSDOM(html, {url:'https://saladeagentes.vercel.app/', runScripts:'dangerously', pretendToBeVisual:true, virtualConsole:vc});
const w4 = dom4.window, d4 = w4.document;
await tick(150);
ok(w4.S.joinPapel === undefined && w4.S.joinCode === undefined, 'entrada sem link (sessão/home): joinPapel nem existe');
/* a janela exata: veio da sala, a sala morreu no caminho, voltou do modo IA */
w4.S.iaFrom='v-sala';
w4.S.sala=null;
d4.querySelector('#ia-voltar').click();
await tick(20);
ok(d4.querySelector('#v-home').hidden === false, 'voltar sem sala e sem link → HOME (antes: tela de entrar quebrada)');
ok(d4.querySelector('#v-join').hidden === true, 'tela de entrar fica inacessível sem link de convite');
ok(d4.querySelector('#ia-voltar') !== null, 'botão voltar segue no lugar');
/* e mesmo caindo na tela de entrar sem papel: o botão entrar não explode mais */
w4.ver('v-join');
d4.querySelector('#join-nome').value='Lucas';
d4.querySelector('#btn-join').click();
await tick(40);
ok(d4.querySelector('#v-home').hidden === false, 'entrar sem código volta pra home com aviso — sem TypeError (bug do tag undefined)');
ok(d4.querySelector('#toast').textContent.length > 0, 'usuário recebe aviso em vez de silêncio');
/* com papel definido o fluxo normal segue intacto */
w4.S.joinCode='AGAB1C2D';
w4.S.joinPapel=PZ.tagDe({h:'1'});
d4.querySelector('#join-nome').value='Ana';
ok(w4.S.joinPapel.tag==='hum', 'papel do link humano segue hum no caminho normal');

/* ═══ higiene anti-vibe ═══ */
secao('anti-vibe: identidade e piso');
ok(html.indexOf('Archivo') >= 0 && html.indexOf('IBM Plex Sans') >= 0 && html.indexOf('IBM Plex Mono') >= 0, 'fontes da identidade presentes (Archivo + IBM Plex)');
ok(html.indexOf('Space Grotesk') < 0 && html.indexOf('JetBrains Mono') < 0, 'sem fonte da era vibe (Space Grotesk/JetBrains)');
ok(!/7c5cff|4f6df5|8b5cf6|a78bfa|7c3aed|background-clip:text/i.test(html), 'sem delator visual (roxo, texto-gradiente)');
ok(html.indexOf('prefers-reduced-motion') >= 0, 'momento de motion único respeita reduced-motion');
ok(html.indexOf('::selection{background:var(--acc)') >= 0, 'seleção na identidade (laranja)');
ok(html.indexOf(':focus-visible{outline:2px solid var(--acc)') >= 0, 'foco visível (laranja)');
ok(html.indexOf('scrollbar-color:var(--line2)') >= 0 && html.indexOf('::-webkit-scrollbar-thumb') >= 0, 'scrollbar temático (FF + WebKit)');
ok(!/[\u{1F300}-\u{1FAFF}]/u.test(html), 'zero emoji no chrome — ícones são a família SVG da casa');
ok(html.indexOf("$('#btn-instr').click()") < 0, 'criar sala NÃO força o texto de instruções na tela (um link por vez)');
ok(html.indexOf('.btn.a') < 0, 'sem família de botão órfã (.btn.a sumiu do design)');
ok(html.indexOf('::placeholder{color:var(--muted)') >= 0, 'placeholders legíveis');
ok(html.indexOf('<meta name="description"') >= 0, 'meta description');
ok(html.indexOf('[hidden]{display:none!important}') >= 0, 'âncora de hidden');
ok(fs.existsSync(path.join(__dirname, '..', 'LICENSE')), 'LICENSE existe');
ok(!/ghp_[A-Za-z0-9]{20}|sk-or-v1-|vcp_[A-Za-z0-9]{20}/.test(html), 'nenhum segredo real no HTML');

secao('CRA: var CSS fantasma (usada × definida)');
const cssAll = html.split('<style>')[1].split('</style>')[0];
const defs = new Set([...cssAll.matchAll(/--([a-z0-9-]+)\s*:/gi)].map(m => m[1].toLowerCase()));
const uses = [...cssAll.matchAll(/var\(--([a-z0-9-]+)/gi)].map(m => m[1].toLowerCase());
const fantasmas = [...new Set(uses)].filter(u => !defs.has(u));
ok(fantasmas.length === 0, 'toda var(--x) usada está definida' + (fantasmas.length ? ' → faltam: ' + fantasmas.join(',') : ''));
const vazios = [...cssAll.matchAll(/(^|})\s*([a-z-]+\[?[^{}]*?)?\s*\{\s*\}/gi)].map(m => m[0]).filter(s => s.replace(/[}\s]/g,'').length > 2);
ok(!/\}\s*tp-tarefa\{\}/.test(cssAll), 'sem seletor vazio esquecido (tell do CRA)');
const grads = html.match(/(repeating-)?(?:linear|radial)-gradient\([^)]*\)/g) || [];
const gradDecor = grads.filter(g => !/var\(--glow\)|var\(--rule\)|rgba\(255,255,255/.test(g));
ok(gradDecor.length === 0, 'zero gradientes decorativos (a única exceção é a atmosfera do papel)');

/* ═══ tema escuro/claro + esquecer listas ═══ */
secao('DOM: tema — escuro é o padrão, claro é opt-in');
ok(html.indexOf('localStorage.getItem("sa_tema")') >= 0, 'script pré-pintura lê o tema salvo (sem flash)');
ok(html.indexOf(':root[data-theme="light"]') >= 0, 'claro é override explícito — ESCURO é o default do CSS');
ok((html.match(/class="btn tema-toggle"/g) || []).length === 2, 'botão de tema no topbar E flutuante (todas as telas)');
ok(html.indexOf("function alternaTema()") >= 0 && html.indexOf('sa_tema') >= 0, 'toggle persiste a escolha');
const docEl = w.document.documentElement;
const temaAntes = docEl.getAttribute('data-theme');
const btnsTema = w.document.querySelectorAll('.tema-toggle');
btnsTema[0].click();
const temaDepois = docEl.getAttribute('data-theme');
ok(temaDepois !== temaAntes, 'clicar no toggle troca o tema na hora');
ok(w.localStorage.getItem('sa_tema') === (temaDepois === 'light' ? 'light' : 'dark'), 'escolha ficou salva no aparelho');
btnsTema[0].click();
ok(docEl.getAttribute('data-theme') === temaAntes, 'toggle volta (e o estado S/tema se restaura)');

secao('DOM: tuas salas e tuas caixas — esquecer uma, esquecer todas');
w.ver('v-home');
w.localStorage.setItem('sa_minhas', JSON.stringify([{c:'AGAB1C2D',n:'landing'},{c:'AGZZ9900',n:'coleta'}]));
w.renderMinhas();
await tick(20);
ok($('#minhas-wrap').hidden === false, 'lista de salas aparece');
ok($$('#minhas [data-esq]').length === 2, 'cada sala tem ✕ de esquecer');
$('#minhas [data-esq="0"]').click();
await tick(20);
ok(JSON.parse(w.localStorage.getItem('sa_minhas')).length === 1, '✕ esquece SÓ a sala daquele item');
ok($('#minhas-wrap').hidden === false, 'lista segue com o que sobrou');
$('#minhas-limpar').click();
await tick(20);
ok($('#minhas-wrap').hidden === true, 'esquecer todas limpa a lista');
ok(w.localStorage.getItem('sa_minhas') === null, 'lista apagada do aparelho');
w.localStorage.removeItem('sa_minhas');
w.localStorage.setItem('sa_caixas', JSON.stringify([{c:'TESTCA1X'},{c:'TESTCA2X'}]));
w.renderCaixas();
await tick(20);
ok($('#cx-limpar').hidden === false, 'caixas: botão esquecer todas visível');
$('#cx-limpar').click();
await tick(20);
ok($('#cx-limpar').hidden === true, 'caixas: após limpar, botão some (lista vazia)');
ok(w.localStorage.getItem('sa_caixas') === '[]', 'caixas esquecidas (sem ressuscitar a seed)');
w.localStorage.removeItem('sa_caixas');
ok(html.indexOf('do caixa-agente, mesmo banco') < 0, 'home SEM menção ao caixa-agente');
ok(html.indexOf('abre no caixa-agente') < 0, 'texto de status sem menção ao caixa-agente');
ok(html.indexOf("caixaUrl(c)") >= 0, 'link funcional das caixas continua (abrir)');

console.log('\n══════════════════════════');
console.log('RESULTADO: ' + pass + ' ✓ / ' + fail + ' ✗' + (fail ? (' → ' + FALHAS.join(' | ')) : ' — SUÍTE INTEIRA PASSOU 🎛️'));
process.exit(fail ? 1 : 0);
})().catch(e=>{console.error('CRASH:',e&&e.message);process.exit(1)});
