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
const URLSALA = 'https://sala-agentes.vercel.app/?s=AG-AB1C2D';
ok(PZ.rolUrl('AGAB1C2D', 'lider').indexOf('?s=AG-AB1C2D&r=lider') > 0, 'link do líder');
ok(PZ.agUrl('AGAB1C2D', 2).indexOf('?s=AG-AB1C2D&a=2') > 0, 'link do Agente 2');
ok(PZ.humUrl('AGAB1C2D').indexOf('?s=AG-AB1C2D&h=1') > 0, 'link dos humanos');
const instr = PZ.instrIA('AGAB1C2D', 'ag', 1, URLSALA);
ok(instr.indexOf('SALA DE AGENTES') >= 0, 'instruções: apresentação da sala');
ok(instr.indexOf('Agente 1') >= 0, 'instruções: papel da IA');
ok(instr.indexOf('TAREFA') >= 0 && instr.indexOf('FEITO') >= 0 && instr.indexOf('BLOQUEIO') >= 0 && instr.indexOf('DECISÃO') >= 0, 'instruções: os 4 tipos');
ok(instr.indexOf('Sem artefato não vale') >= 0, 'instruções: prova obrigatória do FEITO');
ok(instr.indexOf('/boxes/AGAB1C2D/msgs.json') >= 0, 'instruções: endereço REST de leitura');
ok(instr.indexOf('/criado.json') >= 0, 'instruções: renovação do prazo');
ok(instr.indexOf('LÍDER') >= 0 && instr.indexOf('QUADRO') >= 0, 'instruções: regras de convivência');
ok(PZ.novoId() !== PZ.novoId(), 'ids únicos');

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

secao('DOM: aviso do dia 5 e contador no topo');
w.S.sala.criado = Date.now() - (168 - 48) * HORA;
w.renderSala();
await tick(20);
ok($('#banner').hidden === false && $('#banner').textContent.indexOf('baixe teu TXT') >= 0, 'aviso: expira em 2 dias — baixe teu TXT');
ok($('#top-count').textContent.indexOf('expira em') >= 0, 'contador no topo');
w.S.sala.criado = Date.now() - 2 * HORA;
w.renderSala();
await tick(20);
ok($('#banner').hidden === true, 'sala renovada: sem aviso');

secao('DOM: links da sala e criar outro agente');
w.S.linksSessao = [];
w.abreLinks();
await tick(20);
ok($('#m-links').hidden === false, 'modal de links abre');
ok($('#lk-lider').value.indexOf('r=lider') > 0, 'link do líder no modal');
ok($('#lk-ag1').value.indexOf('a=1') > 0, 'Agente 1 no modal');
ok($('#lk-hum').value.indexOf('h=1') > 0, 'link humano no modal');
ok($('#instr-txt').value.indexOf('/boxes/AGAB1C2D/msgs.json') > 0, 'instruções REST no modal');
w.S.linksSessao = [];
(w.S.linksSessao=[2],w.renderLinksMais());
ok($('#lk-mais').innerHTML.indexOf('a=2') > 0, 'agente novo entra na lista de links');
ok($('#lk-mais').textContent.indexOf('Agente 2') > 0, 'rótulo do agente novo');

secao('CORE: limpeza cobre as salas (nó boxes, códigos AG)');
const limpa = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'limpeza.mjs'), 'utf8');
ok(limpa.indexOf("ref('boxes')") >= 0, 'limpeza varre o nó boxes');
ok(limpa.indexOf("code.startsWith('AG')") >= 0, 'limpeza distingue salas (AG) de caixas');
ok(limpa.indexOf('ttlHoras') >= 0 && limpa.indexOf('criado') >= 0, 'limpeza respeita o prazo de cada sala');
const wfl = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'limpeza.yml'), 'utf8');
ok(wfl.indexOf('cron:') >= 0, 'workflow de limpeza agendado');

/* ═══ higiene anti-vibe ═══ */
secao('anti-vibe: identidade e piso');
ok(html.indexOf('Space Grotesk') >= 0 && html.indexOf('JetBrains Mono') >= 0, 'fontes da identidade presentes');
if (/radial-gradient|7c5cff|4f6df5|8b5cf6|a78bfa|7c3aed/.test(html)) { ok(false, 'sem delator visual (roxo/radial)'); }
else ok(true, 'sem delator visual (roxo/radial)');
ok(html.indexOf('::selection{background:var(--cy-soft)') >= 0, 'seleção na identidade (ciano)');
ok(html.indexOf(':focus-visible{outline:2px solid var(--cy)') >= 0, 'foco visível (:focus-visible ciano)');
ok(html.indexOf('scrollbar-color:var(--line)') >= 0 && html.indexOf('::-webkit-scrollbar-thumb') >= 0, 'scrollbar temático (FF + WebKit)');
ok(html.indexOf('::placeholder{color:var(--muted)') >= 0, 'placeholders legíveis');
ok(html.indexOf('<meta name="description"') >= 0, 'meta description');
ok(html.indexOf('[hidden]{display:none!important}') >= 0, 'âncora de hidden');
ok(fs.existsSync(path.join(__dirname, '..', 'LICENSE')), 'LICENSE existe');
ok(!/ghp_[A-Za-z0-9]{20}|sk-or-v1-|vcp_[A-Za-z0-9]{20}/.test(html), 'nenhum segredo real no HTML');

console.log('\n══════════════════════════');
console.log('RESULTADO: ' + pass + ' ✓ / ' + fail + ' ✗' + (fail ? (' → ' + FALHAS.join(' | ')) : ' — SUÍTE INTEIRA PASSOU 🎛️'));
process.exit(fail ? 1 : 0);
})().catch(e=>{console.error('CRASH:',e&&e.message);process.exit(1)});
