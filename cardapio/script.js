/*
  ==========================================================
  SCRIPT.JS (AÇAÍ E AMOR) - VERSÃO FINAL COM MAPA CORRIGIDO
  - Mantém Firebase
  - Transplanta lógica de Mapa/Pino Central/Cálculo de Raio
  - Mantém a regra de preço de entrega original (R$4 fixo + R$1/km)
  ==========================================================
*/

// ==========================================================
// IMPORTAÇÕES
// ==========================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ==========================================================
// CONFIGURAÇÃO FIREBASE (Do seu arquivo)
// ==========================================================
const firebaseConfig = {
  apiKey: "AIzaSyCGv7FpTQr32Uu-y-BU_uoRVITBQuIy-os",
  authDomain: "geraldo-menu.firebaseapp.com",
  projectId: "geraldo-menu",
  storageBucket: "geraldo-menu.firebasestorage.app",
  messagingSenderId: "1043431004683",
  appId: "1:1043431004683:web:f2405018f58b652d1bc50e",
  measurementId: "G-PF3PRRRCRW",
};

// Inicializa Firebase
let db;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  console.log("Firebase (geraldo-menu) inicializado com sucesso para o Açaí!");
} catch (e) {
  console.error("Erro ao inicializar Firebase:", e);
  alert("Erro ao conectar com o sistema de pedidos. Tente recarregar a página.");
}

// ==========================================================
// ESTADO GLOBAL
// ==========================================================
const sacola = []; // { name, price, obs }
let produtoAtual = null;
let precoBase = 0;
let nomeCliente = "Cliente"; // Padrão
let adicionaisPausados = JSON.parse(
  localStorage.getItem("adicionaisPausados") || "[]"
);
window.taxaCalculada = false; // 👈 CORREÇÃO AQUI (Tornamos "window." para ser global)

// ==========================================================
// BLOCO 1: VARIÁVEIS GLOBAIS DO MAPA (TRANSPLANTADO)
// ==========================================================
let mapaLeaflet = null;
let pinoCliente = null; // (Será mantido como null, pois usamos o alvo CSS)

// ⚠️ COORDENADAS DA LOJA "AÇAÍ E AMOR"
const lojaCoords = [-23.01649331113903, -45.561574141913475]; // (Sua coordenada atualizada)


// ==========================================================
// DECLARAÇÃO DE ELEMENTOS (Serão atribuídos no DOMContentLoaded)
// ==========================================================
let listaSacola,
  totalSacola,
  modal,
  modalClose,
  modalImg,
  modalTitle,
  modalDesc,
  modalPrice,
  modalObs,
  modalAdd,
  inputRetirada,
  infoRetirada,
  revisao,
  revisaoClose,
  btnRevisar,
  revisaoLista,
  revSubtotal,
  revTaxa,
  revTotal,
  inputEndereco,
  inputTaxa,
  revisaoConfirmar,
  btnFlutuante,
  btnCarrinhoNovo,
  btnModerador,
  btnGerenciarAdicionais,
  painelAdicionais,
  listaAdicionais,
  popupTroco,
  resumoTroco,
  btnConfirmarTroco,
  modalNome,
  inputNome,
  btnConfirmarNome,
  modalSucesso,
  // 👇 ADIÇÕES DO MAPA 👇
  modalMapa,
  btnFecharMapa,
  btnConfirmarPino,
  divMapa,
  resultadoEntrega,
  btnUsarLocalizacao;
// (btnFecharSucesso foi removido)


// ==========================================================
// FUNÇÕES AUXILIARES (Utils)
// ==========================================================

const brl = (n) => `R$ ${Number(n).toFixed(2).replace(".", ",")}`;

function updateModalState(isOpening) {
  document.body.classList.toggle("modal-open", isOpening);
  if (btnCarrinhoNovo) {
  	if (isOpening) {
  	  btnCarrinhoNovo.style.display = "none";
  	} else {
  	  // CORREÇÃO: Limpa o display para o CSS (classe .hidden) assumir
  	  btnCarrinhoNovo.style.display = "";
  	  atualizarCarrinhoNovo();
  	}
  }
}

function fecharModal(ref) {
  if (!ref) return;
  ref.setAttribute("aria-hidden", "true");
  updateModalState(false);
  // Tira o foco de qualquer elemento ativo (como o botão de fechar)
  // para evitar o erro "aria-hidden"
  if (document.activeElement && document.activeElement.blur) {
  	document.activeElement.blur();
  }
}

function showConfirmPopup() {
  const popup = document.createElement("div");
  popup.className = "confirm-popup";
  popup.textContent = "✅ Adicionado à sacola!";
  document.body.appendChild(popup);
  setTimeout(() => {
  	popup.classList.add("visible");
  }, 10);
  setTimeout(() => {
  	popup.classList.remove("visible");
  	setTimeout(() => popup.remove(), 300);
  }, 1500);
}

// ==========================================================
// FUNÇÕES PRINCIPAIS (Lógica do Cardápio)
// ==========================================================

function atualizarBotaoFlutuante() {
  if (!btnFlutuante) return;
  const contador = document.getElementById("count-itens");
  const valorItens = document.getElementById("valor-itens");
  if (!contador || !valorItens) return;
  const qtd = sacola.length;
  const total = sacola.reduce((acc, it) => acc + it.price, 0);
  if (qtd > 0) {
  	btnFlutuante.style.removeProperty("display");
  	btnFlutuante.classList.remove("hidden");
  	contador.textContent = String(qtd);
  	valorItens.textContent = brl(total);
  	btnFlutuante.onclick = () => {
  	  if (sacola.length === 0) return;
  	  preencherRevisao();
  	  revisao.setAttribute("aria-hidden", "false");
  	  updateModalState(true);
  	};
  } else {
  	btnFlutuante.classList.add("hidden");
  	btnFlutuante.style.removeProperty("display");
  }
}

function atualizarCarrinhoNovo() {
  if (!btnCarrinhoNovo) return;
  const count = document.getElementById("novoCount");
  const totalEl = document.getElementById("novoTotal");
  if (!count || !totalEl) return;

  const qtd = sacola.length;
  const total = sacola.reduce((acc, it) => acc + it.price, 0);

  // Só mostra se tiver itens E nenhum modal estiver aberto
  const modalAberto =
  	(modal && modal.getAttribute("aria-hidden") === "false") ||
  	(revisao && revisao.getAttribute("aria-hidden") === "false") ||
  	(modalNome && modalNome.style.display === "flex") ||
  	(modalSucesso && modalSucesso.style.display === "flex") ||
  	(document.getElementById("modal-acai-builder") &&
  	  document
  		.getElementById("modal-acai-builder")
  		.classList.contains("aberto")) ||
    // ADICIONADO: Verificação do modal do MAPA
    (document.getElementById("map-modal-container") &&
      document
        .getElementById("map-modal-container")
        .classList.contains("aberto"));

  if (qtd > 0 && !modalAberto) {
  	btnCarrinhoNovo.classList.remove("hidden");
  	count.textContent = qtd;
  	totalEl.textContent = brl(total);
  } else {
  	btnCarrinhoNovo.classList.add("hidden");
  }
}

function atualizarSacola() {
  if (!listaSacola || !totalSacola) return;
  listaSacola.innerHTML = "";
  let total = 0;
  sacola.forEach((it, idx) => {
  	total += it.price;
  	const li = document.createElement("li");
  	li.innerHTML = `
  	  <div class="li-info">
${it.name}
${it.obs ? `<br/><small style="opacity:.8">obs: ${it.obs}</small>` : ""}
  	  </div>
  	  <span style="font-weight: 500; margin: 0 10px;">${brl(it.price)}</span>
  	  <button class="btn-remove" data-idx="${idx}">Remover</button>
  	`;
  	listaSacola.appendChild(li);
  });
  totalSacola.innerHTML = `<strong>Total:</strong> ${brl(total)}`;
  atualizarBotaoFlutuante();
  atualizarCarrinhoNovo();
  if (
  	sacola.length === 0 &&
  	revisao &&
  	revisao.getAttribute("aria-hidden") === "false"
  ) {
  	fecharModal(revisao);
  }
}

// (Tornada global para ser acessível pelo script inline do index.html)
window.atualizarTotalComTaxa = function () {
  if (!revSubtotal || !inputTaxa || !revTotal || !revTaxa) return;
  const subtotal =
  	parseFloat(
  	  revSubtotal.textContent.replace("R$", "").replace(",", ".").trim()
  	) || 0;
  const taxa = parseFloat(inputTaxa.value) || 0;
  const total = subtotal + taxa;
  revTotal.innerText = brl(total);
  revTaxa.innerText = brl(taxa);
};

// SUBSTITUA A FUNÇÃO ANTIGA PELA NOVA VERSÃO CORRIGIDA
window.atualizarBotaoWhatsApp = function () {
  if (!revisaoConfirmar || !inputEndereco) return;
  const tipoRadio = document.querySelector('input[name="tipoEntrega"]:checked');
  const tipo = tipoRadio ? tipoRadio.value : "entrega";

  let botaoDesabilitado = true; // Começa desabilitado

  if (tipo === "entrega") {
  	// LÓGICA CORRIGIDA:
  	// O botão deve estar DESABILITADO SE:
  	// 1. A taxa NÃO foi calculada
  	// 	  OU
  	// 2. O campo RUA está vazio
  	const ruaInput = document.getElementById("rua");
  	const rua = ruaInput ? ruaInput.value.trim() : "";
  	
  	// A MÁGICA ESTÁ AQUI
  	botaoDesabilitado = !window.taxaCalculada || !rua; 

  } else {
  	// Para RETIRADA, o botão está sempre habilitado.
  	botaoDesabilitado = false;
  }

  revisaoConfirmar.disabled = botaoDesabilitado;
  revisaoConfirmar.style.opacity = botaoDesabilitado ? 0.5 : 1;
};

function preencherRevisao() {
  if (!revisaoLista || !revSubtotal) return;
  revisaoLista.innerHTML = "";
  let subtotal = 0;
  sacola.forEach((it, idx) => {
  	subtotal += it.price;
  	const li = document.createElement("li");
  	li.innerHTML = `
  	  <div class="li-info">
${it.name}
${it.obs ? `<br/><small style="opacity:.8">obs: ${it.obs}</small>` : ""}
  	  </div>
  	  <span style="font-weight: 500; margin: 0 10px;">${brl(it.price)}</span>
  	  <button class="btn-remove" data-idx="${idx}">Remover</button>
  	`;
  	revisaoLista.appendChild(li);
  });
  revSubtotal.textContent = brl(subtotal);
  window.atualizarTotalComTaxa();
  window.atualizarBotaoWhatsApp(); // 👈 CORREÇÃO AQUI (Chamamos a função global)
}

function abrirModalProduto(el) {
  if (
  	!modal ||
  	!modalImg ||
  	!modalTitle ||
  	!modalDesc ||
  	!modalObs ||
  	!modalPrice
  )
  	return;
  const name = el.dataset.name;
  const price = parseFloat(el.dataset.price);
  const desc = el.dataset.desc || "";
  const img = el.dataset.img || "";
  produtoAtual = el;
  precoBase = price;
  modalImg.src = img;
  modalImg.alt = name;
  modalTitle.textContent = name;
  modalDesc.textContent = desc;
  modalObs.value = "";
  const modalOpcoes = document.getElementById("modalOpcoes");
  if (!modalOpcoes) return;
  modalOpcoes.innerHTML = "";

  // Função interna para recalcular o preço no modal
  function atualizarPrecoModal() {
  	let total = precoBase;
  	const extras = modal.querySelectorAll(".opcoes-modal .extra");
  	extras.forEach((ex) => {
  	  const input = ex.querySelector("input");
  	  const qtdEl = ex.querySelector(".qtd");
  	  const qtd = qtdEl ? parseInt(qtdEl.textContent) || 0 : 0;
  	  const extraValor = input ? parseFloat(input.dataset.extra || "0") : 0;
  	  total += qtd * extraValor;
  	});

    // ATUALIZA O PREÇO ANTIGO (escondido)
  	modalPrice.textContent = brl(total);

    // ATUALIZA O PREÇO FLUTUANTE (se existir)
    const modalFloatPrice = document.getElementById("modalFloatPrice");
    if (modalFloatPrice) modalFloatPrice.textContent = brl(total);
  }

  const blocoOpcoes = el.querySelector(".opcoes-produto");
  if (blocoOpcoes) {
  	const clone = blocoOpcoes.cloneNode(true);
  	clone.classList.remove("opcoes-produto");
  	clone.classList.add("opcoes-modal");
  	modalOpcoes.appendChild(clone);
  	clone.querySelectorAll(".qtd-control").forEach((ctrl) => {
  	  const menos = ctrl.querySelector(".menos");
  	  const mais = ctrl.querySelector(".mais");
  	  const qtdEl = ctrl.querySelector(".qtd");
  	  if (menos && mais && qtdEl) {
  		menos.addEventListener("click", (e) => {
  		  e.stopPropagation();
  		  let val = parseInt(qtdEl.textContent);
  		  if (val > 0) {
  			qtdEl.textContent = val - 1;
  			atualizarPrecoModal();
  		  }
  		});
  		mais.addEventListener("click", (e) => {
  		  e.stopPropagation();
  		  let val = parseInt(qtdEl.textContent);
  		  qtdEl.textContent = val + 1;
  		  atualizarPrecoModal();
  		});
  	  }
  	});
  	clone.querySelectorAll('input[type="checkbox"]').forEach((chk) => {
  	  chk.addEventListener("change", atualizarPrecoModal);
  	});
    // ADIÇÃO: Listener para radios (para saladas, sucos, etc.)
    clone.querySelectorAll('input[type="radio"]').forEach((radio) => {
        radio.addEventListener("change", atualizarPrecoModal);
    });
  }
  atualizarPrecoModal();
  modal.setAttribute("aria-hidden", "false");
  updateModalState(true);
}

function gerarCodigoPedido(nome) {
  let prefixo = "PED";
  if (nome && nome !== "Cliente" && nome.length >= 3) {
  	prefixo = nome.substring(0, 3).toUpperCase();
  } else if (nome && nome !== "Cliente" && nome.length > 0) {
  	prefixo = nome.toUpperCase();
  }
  const sufixo = Math.floor(100 + Math.random() * 900).toString();
  return `${prefixo}-${sufixo}`;
}

// ==========================================================
// BLOCO 3: FUNÇÕES DO MAPA (TRANSPLANTADAS E ADAPTADAS)
// ==========================================================

/**
 * Função chamada pelo botão "Confirmar Endereço no Mapa" (do index.html)
 * Versão Final: Usa o centro do mapa (getCenter) e um alvo visual CSS.
 */
window.abrirModalMapa = async () => {
  if (!modalMapa || !divMapa) {
    console.error("Elementos do modal do mapa não encontrados!");
    return;
  }

  const bairroInput = document.getElementById("endereco");
  const ruaInput = document.getElementById("rua");
  const bairro = bairroInput ? bairroInput.value.trim() : "";
  const rua = ruaInput ? ruaInput.value.trim() : "";

  const btnCalcular = document.getElementById("btnCalcularEntrega");
  if (btnCalcular) {
    btnCalcular.disabled = true;
    btnCalcular.textContent = "Buscando...";
  }

  let finalCoords = lojaCoords;
  let zoomLevel = 15;

  if (rua || bairro) {
    try {
      let coords = null;
      // ⚠️ ATENÇÃO: Verifique se a cidade/estado estão corretos para o Açaí e Amor
      const userAgent = "CardapioAcaiEAmor/1.0 (seu-email@aqui.com)"; 
      const cidadeEstado = ", Taubaté, São Paulo"; // ⚠️ CONFIRME A CIDADE AQUI
      
      const buscarEndereco = async (query) => {
        console.log("Nominatim buscando por:", query);
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=br&limit=1`;
        const resp = await fetch(url, { headers: { "User-Agent": userAgent } }); 
        if (!resp.ok) return null;
        const data = await resp.json();
        return (data && data.length > 0) ? [data[0].lat, data[0].lon] : null;
      };

      if (rua) {
        coords = await buscarEndereco(`${rua}${cidadeEstado}`);
        if (coords) zoomLevel = 18;
      }
      if (!coords && bairro) {
        coords = await buscarEndereco(`${bairro}${cidadeEstado}`);
        if (coords) zoomLevel = 15;
      }
      if (coords) {
        finalCoords = coords;
      } else {
        console.error("Não foi possível achar nem rua nem bairro.");
      }
    } catch (e) {
      console.error("Erro no Geocoding do Nominatim:", e);
    }
  }

  if (btnCalcular) {
    btnCalcular.disabled = false;
    btnCalcular.textContent = "🚗 Confirmar Endereço no Mapa";
  }

  try {
    if (!mapaLeaflet) {
      mapaLeaflet = L.map(divMapa).setView(finalCoords, zoomLevel);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(mapaLeaflet);
      L.marker(lojaCoords).addTo(mapaLeaflet).bindPopup('<b>Local da Loja</b>');
      pinoCliente = null; // Pino visual desativado (usa alvo CSS)
    }
    
    mapaLeaflet.setView(finalCoords, zoomLevel);
    modalMapa.classList.add("aberto");
    updateModalState(true);
    setTimeout(() => {
      if (mapaLeaflet) mapaLeaflet.invalidateSize();
    }, 300); // Atraso para garantir que o modal esteja visível
  } catch (e) {
    console.error("Erro ao inicializar o mapa Leaflet:", e);
    alert("Erro ao carregar o mapa. Verifique sua conexão ou recarregue a página.");
    if (modalMapa) modalMapa.classList.remove("aberto");
    updateModalState(false);
  }
};

/**
 * 🔥 Botão "Usar minha localização atual" (Mantido, mas removido do DOMContentLoaded por enquanto)
 */
function usarLocalizacaoAtual() {
  if (!navigator.geolocation) {
    alert("Geolocalização não é suportada pelo seu navegador.");
    return;
  }
  const btn = document.getElementById("btn-usar-localizacao");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "📍 Buscando...";
  }

  navigator.geolocation.getCurrentPosition(async (position) => {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    const userAgent = "CardapioAcaiEAmor/1.0 (seu-email@aqui.com)"; // ⚠️ MUDE O USER AGENT
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
    
    try {
      const resp = await fetch(url, { headers: { "User-Agent": userAgent } });
      const data = await resp.json();
      
      if (data && data.address) {
        const bairro = data.address.suburb || data.address.city_district || "";
        const rua = (data.address.road || "") + (data.address.house_number ? `, ${data.address.house_number}` : "");

        if (document.getElementById("endereco")) document.getElementById("endereco").value = bairro;
        if (document.getElementById("rua")) document.getElementById("rua").value = rua;
        
        window.abrirModalMapa(true, [lat, lon]); // 'true' pula a busca

      } else { throw new Error("Não foi possível encontrar o nome do bairro."); }
    } catch (e) {
      alert("Não foi possível encontrar seu endereço. Tente digitar o bairro manualmente.");
      window.abrirModalMapa();
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = "📍 Usar minha localização atual"; }
    }
  }, (error) => {
    alert("Você precisa permitir o acesso à localização para usar esta função.");
    if (btn) { btn.disabled = false; btn.innerHTML = "📍 Usar minha localização atual"; }
  });
}


/**
 * Função chamada pelo botão "Confirmar Posição" do modal do mapa
 * 🔥 ATENÇÃO: USANDO A REGRA DE PREÇO DO "AÇAÍ E AMOR" (R$4 até 6km, +R$1/km, max 13km) 🔥
 */
function confirmarPosicaoPino() {
  if (!mapaLeaflet || !inputTaxa || !resultadoEntrega) {
    console.error("Erro: Mapa, Input de Taxa ou Resultado não encontrados.");
    return; 
  }

  const clienteCoords = mapaLeaflet.getCenter(); 
  const distanciaKm = calcularDistanciaRaio(
    lojaCoords[0], lojaCoords[1],
    clienteCoords.lat, clienteCoords.lng
  );

  // ==============================================================
  // ⚠️ REGRA DE PREÇO DO "AÇAÍ E AMOR" (R$4 até 6km, +R$1/km, max 13km) ⚠️
  // ==============================================================
  let taxa = 0;
  
  // 1. Trava de Segurança (Máximo 13km)
  if (distanciaKm > 13) {
    resultadoEntrega.innerHTML = `❌ Desculpe, não entregamos a <b>${distanciaKm.toFixed(2)} km</b>. (Limite: 13km)`;
    alert(`❌ Desculpe, não entregamos neste local!\n\nSua distância: ${distanciaKm.toFixed(1)}km\nNosso raio máximo de entrega é 13km.`);
    window.taxaCalculada = false;
    window.atualizarBotaoWhatsApp();
    return;
  }

  // 2. Regra de R$ 4,00 fixo até 6km
  if (distanciaKm <= 6) {
      taxa = 4.00;
  } 
  // 3. Regra de R$ 1,00 a mais por km acima de 6km
  else {
      // Arredonda a distância total para cima (ex: 7.2km vira 8km)
      const kmArredondado = Math.ceil(distanciaKm); 
      // Calcula o adicional (ex: 8km - 6km = R$ 2,00)
      const adicional = kmArredondado - 6;
      // Taxa final (R$ 4,00 base + adicional)
      taxa = 4.00 + adicional;
  }
  // ==============================================

  inputTaxa.value = taxa.toFixed(2);
  resultadoEntrega.innerHTML = `
    🏁 Distância (raio): <b>${distanciaKm.toFixed(2)} km</b><br>
    💰 Taxa de entrega: <b>${brl(taxa)}</b>
  `;

  window.taxaCalculada = true;
  window.atualizarBotaoWhatsApp();
  window.atualizarTotalComTaxa();

  if(modalMapa) modalMapa.classList.remove("aberto");
  updateModalState(false);
}

/**
 * Fórmula de Haversine (Cálculo de Raio)
 */
function calcularDistanciaRaio(lat1, lon1, lat2, lon2) {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distancia = R * c;
  return distancia; // Retorna em KM
}

// ==========================================================
// FUNÇÃO DE ENVIO (FIREBASE)
// ==========================================================
async function enviarPedido() {
  if (!db) {
  	alert(
  	  "Erro de conexão. Não é possível enviar o pedido. Tente recarregar a página."
  	);
  	return;
  }
  const codigoPedido = gerarCodigoPedido(nomeCliente);
  if (sacola.length === 0) return alert("Sua sacola está vazia!");

  window.atualizarBotaoWhatsApp();
  if (revisaoConfirmar && revisaoConfirmar.disabled) {
  	return alert("Por favor, confirme seu endereço no mapa ou selecione 'Retirada'.");
  }

  // Coleta os dados (igual antes)
  const tipoRadio = document.querySelector('input[name="tipoEntrega"]:checked');
  const tipoEntrega = tipoRadio ? tipoRadio.value : "entrega";
  const taxa = inputTaxa ? parseFloat(inputTaxa.value || "0") : 0;
 
  // --- 👇 LÓGICA DE ENDEREÇO ATUALIZADA 👇 ---
  let enderecoFinal = "Retirada no local";

  if (tipoEntrega === "entrega") {
  	const bairroInput = document.getElementById("endereco"); // Este é o bairro
  	const ruaInput = document.getElementById("rua");
  	const complementoInput = document.getElementById("complemento");

  	const bairro = bairroInput ? bairroInput.value.trim() : "";
  	const rua = ruaInput ? ruaInput.value.trim() : "";
  	const complemento = complementoInput ? complementoInput.value.trim() : "";

  	// VALIDAÇÃO: Verifica se o Bairro (endereco) e a Rua foram preenchidos
  	if (!bairro || !rua) {
  	  alert("Para entrega, por favor preencha os campos 'Bairro' e 'Rua e Número'.");
  	  if (revisaoConfirmar) {
  		 revisaoConfirmar.disabled = false;
  		 revisaoConfirmar.textContent = "✅ Confirmar e enviar no WhatsApp";
  	  }
  	  return;
  	}

  	// Monta o endereço final
  	enderecoFinal = `${rua}, ${bairro}`; 
  	if (complemento) {
  	  enderecoFinal += `, ${complemento}`;
  	}
  }
  // --- 👆 FIM DA LÓGICA DE ENDEREÇO 👆 ---

  const subtotal = sacola.reduce((acc, it) => acc + it.price, 0);
  const totalFinal = subtotal + (isNaN(taxa) ? 0 : taxa);
  const pagRadio = document.querySelector('input[name="pagamento"]:checked');
  const formaPagamento = pagRadio ? pagRadio.value : "Cartão";
  let obsPagamento = "";

  if (formaPagamento === "Dinheiro") {
  	obsPagamento = resumoTroco ? resumoTroco.textContent.trim() : "";
  	if (!obsPagamento) {
  	  return alert(
  		"Se o pagamento é em dinheiro, por favor, informe o valor para troco."
  	  );
  	}
  }
  const linhas = sacola.map((it) => {
  	const base = `${it.name} — ${brl(it.price)}`;
  	return it.obs ? `${base} (obs: ${it.obs})` : base;
  });

  const pedido = {
  	codigo: codigoPedido,
  	nomeCliente: nomeCliente,
  	endereco: enderecoFinal, 
  	itens: sacola,
  	subtotal,
  	taxa,
  	total: totalFinal,
  	pagamento: formaPagamento,
  	obsPagamento: obsPagamento || null,
  	status: "pendente",
  	data: serverTimestamp(),
  };

  try {
  	if (revisaoConfirmar) {
  	  revisaoConfirmar.disabled = true;
  	  revisaoConfirmar.textContent = "Enviando...";
  	}
  	await addDoc(collection(db, "pedidos-acai"), pedido);
  	console.log("✅ Pedido salvo no Firestore!");
  } catch (err) {
  	console.error("❌ Erro ao salvar pedido:", err);
  	alert("Erro ao salvar o pedido. Tente novamente.");
  	if (revisaoConfirmar) {
  	  revisaoConfirmar.disabled = false;
  	  revisaoConfirmar.textContent = "✅ Confirmar e enviar no WhatsApp";
  	}
  	return;
  }

  const linhasMsg = linhas.map((l) => `• ${l}`).join("\n");
  let msg =
  	`*--- NOVO PEDIDO (AÇAÍ & AMOR) ---*\n` +
  	`*CÓDIGO DO PEDIDO: #${codigoPedido}*\n` +
  	`*Cliente:* ${nomeCliente}\n\n${linhasMsg}\n\n` +
  	`Subtotal: ${brl(subtotal)}\nTaxa: ${brl(taxa)}\n*Total: ${brl(
  	  totalFinal
  	)}*\n\n` +
  	`*Pagamento:* ${formaPagamento}\n` +
  	(obsPagamento ? `*Troco:* ${obsPagamento}\n` : "") +
  	`*Entrega:* ${enderecoFinal}\n`; 

  // **** NÚMERO DO WHATSAPP DA LOJA ****
  const numero = "5512991320722";
  const link = `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
  window.open(link, "_blank");

  // --- LÓGICA DE RESETAR O CARDÁPIO ---
  sacola.length = 0;
  atualizarSacola();
  fecharModal(revisao);
  if (modalSucesso) {
  	modalSucesso.style.display = "flex";
  	updateModalState(true);
  }
  // --- FIM DO RESET ---

  if (revisaoConfirmar) {
  	revisaoConfirmar.disabled = false;
  	revisaoConfirmar.textContent = "✅ Confirmar e enviar no WhatsApp";
  }
}
// ==========================================================
// FUNÇÕES DE ADMIN (Moderador, Adicionais)
// ==========================================================
// (Estas funções são chamadas pelo DOMContentLoaded)

function prepararCardsModerador() {
  document.querySelectorAll(".item").forEach((card) => {
  	// VERIFICA SE ESTE É O CARD DO "MONTE SEU AÇAÍ"
  	const isCardAcaiBuilder = card.querySelector(".btn-abrir-modal");
  	if (isCardAcaiBuilder) {
  	  // Se for o card do Açaí, não adicione este listener
  	  return;
  	}

  	// Se NÃO for o card do Açaí, adicione o listener antigo (das batatas)
  	card.addEventListener("click", (e) => {
  	  // Verifica se o clique foi em um dos botões de "ação" que NÃO devem abrir o modal
  	  const isBotaoPausar = e.target.closest(".btn-pausar");
  	  const isBotaoQtd = e.target.closest(".qtd-control");

  	  // Se o clique NÃO FOI no botão de pausar E NÃO FOI no controle de qtd...
  	  // ...então pode abrir o modal!
  	  // Isso permite que o clique no card OU no botão "ver-detalhes" funcione.
  	  if (!isBotaoPausar && !isBotaoQtd) {
  		abrirModalProduto(card);
  	  }
  	});
  });
}

function initModerador() {
  const senhaModerador = "acai123"; // **** MUDE A SENHA DE ADMIN ****
  if (!btnModerador) return;
  let pausados = JSON.parse(localStorage.getItem("itensPausados") || "[]");
  pausados.forEach((nome) => {
  	const item = document.querySelector(`.item[data-name="${nome}"]`);
  	if (item) item.classList.add("pausado");
  });
  btnModerador.addEventListener("click", () => {
  	const senha = prompt("Digite a senha do modo moderador:");
  	if (senha !== senhaModerador) return alert("❌ Senha incorreta!");
  	document.body.classList.toggle("modoModerador");
  	const ativo = document.body.classList.contains("modoModerador");
  	const aviso = document.querySelector(".moderador-ativo");
  	if (ativo) {
  	  alert("✅ Modo moderador ativado!");
  	  if (!aviso) {
  		const novoAviso = document.createElement("div");
  		novoAviso.className = "moderador-ativo";
  		novoAviso.textContent = "🟢 Modo Moderador ativo";
  		document.body.appendChild(novoAviso);
  	  }
  	  prepararCardsModerador();
  	} else {
  	  alert("🟡 Modo moderador desativado.");
  	  if (aviso) aviso.remove();
  	}
  	if (btnGerenciarAdicionais) {
  	  btnGerenciarAdicionais.style.display = ativo ? "inline-block" : "none";
  	}
  });
}

// ==========================================================
// 1. SUBSTITUA ESTA FUNÇÃO
// ==========================================================

function atualizarEstadoExtras() {
  // Remove a lógica antiga (que procurava ".extra")

  // VVV --- NOVA LÓGICA --- VVV
  // Procura todas as opções dentro do NOVO modal
  const todosOpcoes = document.querySelectorAll(
  	"#modal-acai-builder .opcao-item"
  );

  todosOpcoes.forEach((opcao) => {
  	const input = opcao.querySelector("input");
  	if (!input) return;

  	const nome = input.value; // Ex: "300ml" ou "Leite condensado"

  	// (A array 'adicionaisPausados' é a sua variável global que já existe)
  	const isPausado = adicionaisPausados.includes(nome);

  	// Se estiver pausado, esconde o item do modal do cliente
  	opcao.style.display = isPausado ? "none" : "flex";

  	// Adiciona a classe (para o CSS que já existe, se houver)
  	opcao.classList.toggle("pausado", isPausado);
  });
  // ^^^ --- FIM DA NOVA LÓGICA --- ^^^
}
// ==========================================================
// 2. SUBSTITUA ESTA FUNÇÃO
// ==========================================================

function abrirPainelAdicionais() {
  if (!listaAdicionais || !painelAdicionais) return;

  // VVV --- NOVA LÓGICA --- VVV
  // Procura todos os inputs (radio e checkbox) dentro do modal do açaí
  const todosItens = document.querySelectorAll(
  	"#modal-acai-builder .opcao-item input"
  );

  // Usar um Map para garantir nomes únicos e guardar a label
  const nomesUnicos = new Map();

  todosItens.forEach((input) => {
  	const valor = input.value; // Ex: "300ml" (este é o ID que salvamos)

  	// Tenta pegar o texto da label para ser mais amigável
  	const labelSpan = input
  	  .closest(".opcao-item")
  	  .querySelector("label span:first-child");
  	const nomeAmigavel = labelSpan ? labelSpan.textContent : valor; // Ex: "300ml" ou "Leite condensado"

  	if (valor && !nomesUnicos.has(valor)) {
  	  nomesUnicos.set(valor, nomeAmigavel);
  	}
  });
  // ^^^ --- FIM DA NOVA LÓGICA --- ^^^

  listaAdicionais.innerHTML = ""; // Limpa a lista

  // Ordena pelo nome amigável (A-Z)
  const itensOrdenados = [...nomesUnicos.entries()].sort((a, b) =>
  	a[1].localeCompare(b[1])
  );

  // Agora constrói o painel com os itens ordenados
  itensOrdenados.forEach(([valor, nomeAmigavel]) => {
  	// [valor, nomeAmigavel]
  	const li = document.createElement("li");
  	li.style.cssText =
  	  "margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;";

  	const span = document.createElement("span");
  	span.textContent = nomeAmigavel; // Mostra "300ml"

  	const btn = document.createElement("button");
  	const pausado = adicionaisPausados.includes(valor); // Checa por "300ml"

  	btn.textContent = pausado ? "▶️ Ativar" : "⏸️ Pausar";
  	btn.className = "btn-primario";
  	btn.style.background = pausado ? "#4CAF50" : "#ffc107";
  	btn.style.color = pausado ? "#fff" : "#000";
  	btn.style.minWidth = "80px";

  	btn.addEventListener("click", () => {
  	  // Atualiza a lista de pausados
  	  adicionaisPausados = adicionaisPausados.includes(valor)
  		? adicionaisPausados.filter((n) => n !== valor)
  		: [...adicionaisPausados, valor];

  	  // Salva no localStorage do navegador
  	  localStorage.setItem(
  		"adicionaisPausados",
  		JSON.stringify(adicionaisPausados)
  	  );

  	  atualizarEstadoExtras(); // Atualiza a aparência no modal do cliente
  	  abrirPainelAdicionais(); // Reconstrói o painel para mostrar o novo status
  	});

  	li.appendChild(span);
  	li.appendChild(btn);
  	listaAdicionais.appendChild(li);
  });

  painelAdicionais.setAttribute("aria-hidden", "false");
  updateModalState(true);
}

// (Esta função é chamada pelo `onclick` no `index.html`)
window.fecharPainelAdicionais = function () {
  if (!painelAdicionais) return;
  painelAdicionais.setAttribute("aria-hidden", "true");
  updateModalState(false);
};

function initPainelAdicionais() {
  if (!btnGerenciarAdicionais || !painelAdicionais || !listaAdicionais) {
  	console.warn("⚠️ Elementos do painel de adicionais não encontrados.");
  	return;
  }
  btnGerenciarAdicionais.addEventListener("click", abrirPainelAdicionais);
  atualizarEstadoExtras();
}

// ===================================================================
// ===== INICIALIZAÇÃO (AQUI FICA O DOMCONTENTLOADED) =====
// ===================================================================

document.addEventListener("DOMContentLoaded", () => {

  // ==========================================================
  // 1. LÓGICA DE LOJA ABERTA/FECHADA (EXECUTAR PRIMEIRO)
  // ==========================================================
  const overlayFechado = document.getElementById("loja-fechada-overlay");
  const mensagemEl = document.getElementById("loja-fechada-mensagem");

  if (overlayFechado && mensagemEl) {
    const agora = new Date();
    const diaDaSemana = agora.getDay(); // 0 = Domingo, 6 = Sábado
    const horaAtual = agora.getHours();
    const minutoAtual = agora.getMinutes();
    const tempoAtualEmMinutos = horaAtual * 60 + minutoAtual;

    // Horário de fechamento: 3:05 AM
    const horaFechamento = 3;
    const minutoFechamento = 5;
    const tempoFechamento = horaFechamento * 60 + minutoFechamento; // 185 minutos

    // Horário de abertura: 11:00 (Seg-Sáb) ou 12:00 (Dom)
    let horaAbertura = 11;
    if (diaDaSemana === 0) {
      // 0 é Domingo
      horaAbertura = 12;
    }
    const tempoAbertura = horaAbertura * 60; // 660 ou 720 minutos

    const estaAberta =
      tempoAtualEmMinutos >= tempoAbertura ||
      tempoAtualEmMinutos < tempoFechamento;

    // SE A LOJA ESTIVER FECHADA
    if (!estaAberta) {
      let proximaHoraAberturaStr = "11:00";

      if (tempoAtualEmMinutos > tempoFechamento) {
        if (diaDaSemana === 0) {
          proximaHoraAberturaStr = "12:00";
        } else {
          proximaHoraAberturaStr = "11:00";
        }
      }
      else if (diaDaSemana === 0) {
        proximaHoraAberturaStr = "12:00";
      }
      else if (diaDaSemana === 1) {
        proximaHoraAberturaStr = "11:00";
      }
      else {
        proximaHoraAberturaStr = "11:00";
      }

      const mensagem = `Loja fechada, abriremos às ${proximaHoraAberturaStr}.`;
      mensagemEl.textContent = mensagem;
      overlayFechado.style.display = "flex";
      return;
    }
  }
  // --- FIM DA LÓGICA DE LOJA FECHADA ---


  // --- 1. Atribui todos os elementos do DOM a variáveis ---
  listaSacola = document.getElementById("lista-sacola");
  totalSacola = document.getElementById("total-sacola");
  modal = document.getElementById("modal");
  modalClose = document.getElementById("modalClose");
  modalImg = document.getElementById("modalImg");
  modalTitle = document.getElementById("modalTitle");
  modalDesc = document.getElementById("modalDesc");
  modalPrice = document.getElementById("modalPrice");
  modalObs = document.getElementById("modalObs");
  modalAdd = document.getElementById("modalAdd");
  inputRetirada = document.getElementById("opcaoRetirada");
  infoRetirada = document.getElementById("infoRetirada");
  revisao = document.getElementById("revisao");
  revisaoClose = document.getElementById("revisaoClose");
  btnRevisar = document.getElementById("btn-revisar");
  revisaoLista = document.getElementById("revisaoLista");
  revSubtotal = document.getElementById("revSubtotal");
  revTaxa = document.getElementById("revTaxa");
  revTotal = document.getElementById("revTotal");
  inputEndereco = document.getElementById("endereco");
  inputTaxa = document.getElementById("taxa");
  revisaoConfirmar = document.getElementById("revisaoConfirmar");
  btnFlutuante = document.getElementById("btn-flutuante");
  btnCarrinhoNovo = document.getElementById("btnCarrinhoNovo");
  btnModerador = document.getElementById("btnModerador");
  btnGerenciarAdicionais = document.getElementById("btnGerenciarAdicionais");
  painelAdicionais = document.getElementById("painelAdicionais");
  listaAdicionais = document.getElementById("listaAdicionais");
  popupTroco = document.getElementById("popupTroco");
  resumoTroco = document.getElementById("resumoTroco");
  btnConfirmarTroco = document.getElementById("confirmarTroco");

  // --- Variáveis do Mapa (transplantadas) ---
  modalMapa = document.getElementById("map-modal-container");
  btnFecharMapa = document.getElementById("btn-fechar-mapa");
  btnConfirmarPino = document.getElementById("btn-confirmar-pino");
  divMapa = document.getElementById("map-leaflet");
  resultadoEntrega = document.getElementById("resultadoEntrega");
  btnUsarLocalizacao = document.getElementById("btn-usar-localizacao");

  // --- Nossas novas variáveis ---
  modalNome = document.getElementById("modal-nome");
  inputNome = document.getElementById("input-nome-cliente");
  btnConfirmarNome = document.getElementById("btn-confirmar-nome");
  modalSucesso = document.getElementById("modal-sucesso");
  // btnFecharSucesso foi removido, pois não existe mais

  // --- 2. Lógica de Inicialização (Pop-up de Nome) ---
  if (modalNome && inputNome && btnConfirmarNome) {
  	// REMOVEMOS a verificação do localStorage.

  	// Força o modal a aparecer TODA VEZ:
  	modalNome.style.display = "flex";
  	updateModalState(true); // Trava o scroll

  	// O botão de confirmar agora SÓ fecha o modal, sem salvar.
  	btnConfirmarNome.addEventListener("click", () => {
  	  const nomeDigitado = inputNome.value.trim();
  	  if (nomeDigitado.length < 2) {
  		alert("Por favor, digite um nome válido.");
  		return;
  	  }
  	  // Define o nome apenas para esta sessão (não salva)
  	  nomeCliente = nomeDigitado;

  	  // REMOVEMOS a linha que salvava no localStorage.

  	  modalNome.style.display = "none";
  	  updateModalState(false); // Destrava o scroll
  	});
  }

  // ==========================================================
  // --- 2.5. Lógica do Modal "Monte seu Açaí" (CÓDIGO NOVO) ---
  // ==========================================================
  const modalAcaiBuilder = document.getElementById("modal-acai-builder");
  const btnAbrirAcai = document.querySelector(".btn-abrir-modal");
  const btnFecharAcai = document.querySelector(".btn-fechar-modal");

  function abrirModalAcai() {
  	if (modalAcaiBuilder) {
  	  modalAcaiBuilder.classList.add("aberto");
  	  updateModalState(true); // Reutiliza sua função
  	}
  }

  function fecharModalAcai() {
  	if (modalAcaiBuilder) {
  	  modalAcaiBuilder.classList.remove("aberto");
  	  updateModalState(false); // Reutiliza sua função
  	}
  }

  // Adiciona os listeners do NOVO modal
  if (btnAbrirAcai) {
  	btnAbrirAcai.onclick = abrirModalAcai;
  }
  if (btnFecharAcai) {
  	btnFecharAcai.onclick = fecharModalAcai;
  }
  if (modalAcaiBuilder) {
  	modalAcaiBuilder.onclick = function (event) {
  	  if (event.target === modalAcaiBuilder) {
  		fecharModalAcai();
  	  }
  	};
  }

  // ==========================================================
  // --- 2.6. LÓGICA INTERNA DO MODAL AÇAÍ (CÁLCULOS) ---
  // ==========================================================

  // Seleciona todos os elementos DENTRO do modal do açaí
  const precoTotalEl = modalAcaiBuilder.querySelector(".preco-total-modal");
  const btnAddAcai = modalAcaiBuilder.querySelector(".btn-add-carrinho");
  const allInputs = modalAcaiBuilder.querySelectorAll(
  	'input[type="radio"], input[type="checkbox"]'
  );
  const qtdElAcai = modalAcaiBuilder.querySelector(
  	".acai-modal-footer .qtd"
  );
  const btnMenosAcai = modalAcaiBuilder.querySelector(
  	".acai-modal-footer .menos"
  );
  const btnMaisAcai = modalAcaiBuilder.querySelector(
  	".acai-modal-footer .mais"
  );

  /**
   /**
  	* Calcula o preço total do açaí montado e atualiza o rodapé do modal.
  	*/
  function calcularPrecoAcai() {
  	if (!modalAcaiBuilder || !precoTotalEl) return 0;

  	let precoUnitario = 0;

  	// 1. Pega o preço do TAMANHO (Radio)
  	const tamanhoChecked = modalAcaiBuilder.querySelector(
  	  'input[name="tamanho"]:checked'
  	);
  	if (tamanhoChecked) {
  	  precoUnitario += parseFloat(tamanhoChecked.dataset.price || 0);
  	}

  	// 2. Pega o preço da BASE (Checkboxes) - (LÓGICA ATUALIZADA)
  	const basesChecked = modalAcaiBuilder.querySelectorAll(
  	  'input[name="base_selecao"]:checked' // 👈 Seletor atualizado
  	);
  	basesChecked.forEach((input) => {
  	  // 👈 Loop atualizado
  	  precoUnitario += parseFloat(input.dataset.price || 0);
  	});

  	// 3. Soma o preço de TODOS os ADICIONAIS (Checkboxes)
  	const adicionaisChecked = modalAcaiBuilder.querySelectorAll(
  	  'input[name="adicional"]:checked'
  	);
  	adicionaisChecked.forEach((input) => {
  	  precoUnitario += parseFloat(input.dataset.price || 0);
  	});

  	// 4. Soma o preço de TODAS as CALDAS (Checkboxes)
  	const caldasChecked = modalAcaiBuilder.querySelectorAll(
  	  'input[name="calda"]:checked'
  	);
  	caldasChecked.forEach((input) => {
  	  precoUnitario += parseFloat(input.dataset.price || 0);
  	});

  	// 5. Soma o preço de TODOS os PREMIUM (Checkboxes)
  	const premiumChecked = modalAcaiBuilder.querySelectorAll(
  	  'input[name="premium"]:checked'
  	);
  	premiumChecked.forEach((input) => {
  	  precoUnitario += parseFloat(input.dataset.price || 0);
  	});

  	// 6. Pega a Quantidade
  	const quantidade = parseInt(qtdElAcai.textContent || "1");

  	// 7. Calcula o preço final
  	const precoFinal = precoUnitario * quantidade;

  	// 8. Atualiza o texto no botão
  	precoTotalEl.textContent = brl(precoFinal);

  	return precoFinal; // Retorna o valor final
  }

  /**
   /**
  	* Reseta o modal do açaí para o estado padrão.
  	*/
  function resetarModalAcai() {
  	// Desmarca todos os checkboxes
  	modalAcaiBuilder
  	  .querySelectorAll('input[type="checkbox"]')
  	  .forEach((chk) => {
  		chk.checked = false;
  	  });

  	// Reseta os radios para o padrão (300ml)
  	const defaultTamanho = modalAcaiBuilder.querySelector(
  	  'input[name="tamanho"][data-price="11.99"]'
  	);
  	if (defaultTamanho) defaultTamanho.checked = true;

  	// (LÓGICA ATUALIZADA)
  	// Reseta a base padrão (Marca Açaí)
  	const defaultBase = modalAcaiBuilder.querySelector(
  	  "input#b-acai" // 👈 Seletor atualizado
  	);
  	if (defaultBase) defaultBase.checked = true;

  	// Reseta a quantidade para 1
  	if (qtdElAcai) qtdElAcai.textContent = "1";

  	// Atualiza o preço para o valor padrão
  	calcularPrecoAcai();
  }

  // --- Adiciona os Event Listeners ---

  // 1. Quando QUALQUER opção (radio ou checkbox) mudar, recalcula o preço
  allInputs.forEach((input) => {
  	input.addEventListener("change", calcularPrecoAcai);
  });

  // 2. Controla o botão de quantidade (-)
  btnMenosAcai.addEventListener("click", () => {
  	let val = parseInt(qtdElAcai.textContent);
  	if (val > 1) {
  	  // Não deixa ser menor que 1
  	  qtdElAcai.textContent = val - 1;
  	  calcularPrecoAcai(); // Recalcula o preço
  	}
  });

  // 3. Controla o botão de quantidade (+)
  btnMaisAcai.addEventListener("click", () => {
  	let val = parseInt(qtdElAcai.textContent);
  	qtdElAcai.textContent = val + 1;
  	calcularPrecoAcai(); // Recalcula o preço
  });

  // 4. Controla o botão "Adicionar"
  btnAddAcai.addEventListener("click", () => {
  	// ==========================================================
  	// 👇 VALIDAÇÃO OBRIGATÓRIA (CÓDIGO NOVO) 👇
  	// ==========================================================
  	const basesSelecionadas = modalAcaiBuilder.querySelectorAll(
  	  'input[name="base_selecao"]:checked'
  	);

  	if (basesSelecionadas.length === 0) {
  	  // Se nenhuma base estiver marcada, mostra um alerta e para a função
  	  alert(
  		"Por favor, selecione pelo menos uma base (Açaí ou Cupuaçu) para continuar."
  	  );
  	  return; // 👈 Impede o resto do código de rodar
  	}
  	// ==========================================================
  	// FIM DA VALIDAÇÃO
  	// ==========================================================

  	// Pega todos os nomes dos itens selecionados
  	const nomeAdicionais = [];
  	const tamanho = modalAcaiBuilder.querySelector(
  	  'input[name="tamanho"]:checked'
  	);

  	// (LÓGICA ATUALIZADA) - Reutiliza a variável que pegamos ali em cima
  	const bases = basesSelecionadas;

  	if (tamanho) nomeAdicionais.push(tamanho.value);

  	// 👇 Loop atualizado
  	bases.forEach((input) => {
  	  nomeAdicionais.push(input.value);
  	});

  	// Pega todos os outros checkboxes
  	const outrosChecked = modalAcaiBuilder.querySelectorAll(
  	  'input[type="checkbox"]:checked:not([name="base_selecao"])' // Garante que não pegue a base de novo
  	);
  	outrosChecked.forEach((input) => {
  	  nomeAdicionais.push(input.value);
  	});

  	// Formata o nome final do produto
  	const nomeFinal = `Açaí Montado (${nomeAdicionais.join(", ")})`;

  	// Pega o preço e quantidade
  	const precoFinalTotal = calcularPrecoAcai();
  	const quantidade = parseInt(qtdElAcai.textContent || "1");
  	const precoUnitario = precoFinalTotal / quantidade; // Calcula o preço de 1 unidade

  	// Adiciona o item (ou itens) na sacola principal
  	for (let i = 0; i < quantidade; i++) {
  	  sacola.push({
  		name: nomeFinal,
  		price: precoUnitario,
  		obs: null,
  	  });
  	}

  	// Chama as funções globais do seu script
  	atualizarSacola();
  	showConfirmPopup();
  	fecharModalAcai(); // Fecha o modal do açaí
  	resetarModalAcai(); // Limpa o modal para a próxima vez
  });
  // ==========================================================
  // --- FIM DA LÓGICA INTERNA DO MODAL AÇAÍ ---
  // ==========================================================
  // --- FIM DO CÓDIGO NOVO ---

  // --- 3. Adiciona TODOS os Event Listeners ---

  // (Listener do btnFecharSucesso foi removido)

  // Abrir modal ao clicar no card (LÓGICA CORRIGIDA E UNIFICADA)
  document.querySelectorAll(".item").forEach((card) => {
  	// VERIFICA SE ESTE É O CARD DO "MONTE SEU AÇAÍ"
  	const isCardAcaiBuilder = card.querySelector(".btn-abrir-modal");

  	if (isCardAcaiBuilder) {
  	  // ✅ Se for o card do Açaí, o card INTEIRO abre o modal do açaí
  	  card.addEventListener("click", (e) => {
  		// Exceção: não abrir se clicar no botão de pausar (admin)
  		const isBotaoPausar = e.target.closest(".btn-pausar");
  		if (!isBotaoPausar) {
  		  abrirModalAcai(); // 👈 CHAMA A FUNÇÃO DO MODAL AÇAÍ
  		}
  	  });
  	} else {
  	  // ❌ Se NÃO for o card do Açaí, adicione o listener antigo (das batatas)
  	  card.addEventListener("click", (e) => {
  		// Verifica se o clique foi em um dos botões que NÃO devem abrir o modal
  		const isBotaoPausar = e.target.closest(".btn-pausar");
  		const isBotaoQtd = e.target.closest(".qtd-control");

  		if (!isBotaoPausar && !isBotaoQtd) {
  		  abrirModalProduto(card); // 👈 CHAMA A FUNÇÃO DO MODAL ANTIGO
  		}
  	  });
  	}
  });

  if (modalClose)
  	modalClose.addEventListener("click", () => fecharModal(modal));
  if (revisaoClose)
  	revisaoClose.addEventListener("click", () => fecharModal(revisao));
  if (modal)
  	modal.addEventListener("click", (e) => {
  	  if (e.target === modal) fecharModal(modal);
  	});
  if (revisao)
  	revisao.addEventListener("click", (e) => {
  	  if (e.target === revisao) fecharModal(revisao);
  	});

  if (modalAdd)
  	modalAdd.addEventListener("click", () => {
  	  if (!produtoAtual) return;
  	  const obs = modalObs.value.trim();
  	  let adicionaisSelecionados = [];
  	  let extraTotal = 0;
  	  const extras = modal.querySelectorAll(".opcoes-modal .extra");
  	  extras.forEach((ex) => {
  		const input = ex.querySelector("input");
  		const qtdEl = ex.querySelector(".qtd");
  		const qtd = qtdEl ? parseInt(qtdEl.textContent) || 0 : 0;
  		if (qtd > 0) {
  		  const valorExtra = input
  			? parseFloat(input.dataset.extra || "0")
  			: 0;
  		  adicionaisSelecionados.push(
  			`${qtd}x ${input ? input.value : "Adicional"}`
  		  );
  		  extraTotal += qtd * valorExtra;
  		}
  	  });

      // ADIÇÃO: Pega o radio button selecionado (para sucos/saladas)
      const radioChecked = modal.querySelector('.opcoes-modal input[type="radio"]:checked');
      if(radioChecked) {
          const label = radioChecked.closest('label');
          const spanTexto = label ? label.querySelector('span') : null;
          if (spanTexto) {
              adicionaisSelecionados.push(spanTexto.textContent.trim());
          }
          extraTotal += parseFloat(radioChecked.dataset.extra || 0);
      }

  	  const finalPrice = precoBase + extraTotal;
  	  sacola.push({
  		name:
  		  produtoAtual.dataset.name +
  		  (adicionaisSelecionados.length
  			? ` (${adicionaisSelecionados.join(", ")})`
  			: ""),
  		price: finalPrice,
  		obs: obs || null,
  	  });
  	  atualizarSacola();
  	  showConfirmPopup();
  	  fecharModal(modal);
  	});

  if (listaSacola)
  	listaSacola.addEventListener("click", (e) => {
  	  const btn = e.target.closest(".btn-remove");
  	  if (!btn) return;
  	  const idx = Number(btn.dataset.idx);
  	  sacola.splice(idx, 1);
  	  atualizarSacola();
  	  if (revisao && revisao.getAttribute("aria-hidden") === "false")
  		preencherRevisao();
  	});

  if (btnRevisar)
  	btnRevisar.addEventListener("click", () => {
  	  if (sacola.length === 0) return alert("Sua sacola está vazia!");
  	  preencherRevisao();
  	  if (revisao) revisao.setAttribute("aria-hidden", "false");
  	  updateModalState(true);
  	});

  if (revisaoLista)
  	revisaoLista.addEventListener("click", (e) => {
  	  const btn = e.target.closest(".btn-remove");
  	  if (!btn) return;
  	  const idx = Number(btn.dataset.idx);
  	  sacola.splice(idx, 1);
  	  atualizarSacola();
  	  if (sacola.length === 0) fecharModal(revisao);
  	  else preencherRevisao();
  	});

  if (inputTaxa)
  	inputTaxa.addEventListener("input", window.atualizarTotalComTaxa);
  if (revisaoConfirmar)
  	revisaoConfirmar.addEventListener("click", enviarPedido);

  const header = document.querySelector(".brand-header");
  if (header) {
  	window.addEventListener("scroll", () => {
  	  header.classList.toggle("minimized", window.scrollY > 50);
  	});
  }

  if (btnCarrinhoNovo)
  	btnCarrinhoNovo.addEventListener("click", () => {
  	  if (sacola.length === 0) return;
  	  preencherRevisao();
  	  if (revisao) revisao.setAttribute("aria-hidden", "false");
  	  updateModalState(true);
  	});

  // 👇 ADICIONE ESTE BLOCO NOVO AQUI 👇
  if (inputEndereco) {
  	inputEndereco.addEventListener("input", () => {
  	  // Se o cliente digitar no campo de endereço DEPOIS de ter calculado a taxa
  	  if (window.taxaCalculada) { // 👈 CORREÇÃO AQUI
  		window.taxaCalculada = false; // "Sujou" o cálculo, precisa recalcular
  		window.atualizarBotaoWhatsApp(); // Trava o botão de novo
  	  }
  	});
  }
  // 👆 FIM DA ADIÇÃO 👆

  // --- 👇 ADICIONE ESTE NOVO LISTENER AQUI 👇 ---
  // (Para checar o botão CADA VEZ que o usuário digita a RUA)
  const ruaInput = document.getElementById("rua");
  if (ruaInput) {
  	ruaInput.addEventListener("input", () => {
  	  window.atualizarBotaoWhatsApp(); // Atualiza o status do botão
  	});
  }
  // --- 👆 FIM DA ADIÇÃO 👆 ---

  document.querySelectorAll('input[name="tipoEntrega"]').forEach((radio) => {
  	radio.addEventListener("change", () => {
  	  const tipoSelecionadoRadio = document.querySelector(
  		'input[name="tipoEntrega"]:checked'
  	  );
  	  const tipoSelecionado = tipoSelecionadoRadio
  		? tipoSelecionadoRadio.value
  		: "entrega";
  	  const campoEndereco = document.getElementById("campoEndereco");
  	  const infoRetirada = document.getElementById("infoRetirada");
  	  const resultadoEntrega = document.getElementById("resultadoEntrega");

  	  if (
  		campoEndereco &&
  		infoRetirada &&
  		inputTaxa &&
  		inputEndereco &&
  		resultadoEntrega
  	  ) {
  		if (tipoSelecionado === "retirada") {
  		  campoEndereco.style.display = "none";
  		  infoRetirada.style.display = "block";
  		  inputTaxa.value = "0.00";
  		  inputEndereco.disabled = true;
  		  resultadoEntrega.innerHTML =
  			"ℹ️ Retirada no local selecionada. Sem taxa de entrega.";
  		  window.taxaCalculada = true; // ✅ CORREÇÃO AQUI
  		} else {
  		  campoEndereco.style.display = "block";
  		  infoRetirada.style.display = "none";
  		  inputEndereco.disabled = false;
          // LIMPA O RESULTADO SE VOLTAR PARA ENTREGA
          if(resultadoEntrega) resultadoEntrega.innerHTML = ""; 
  		  window.taxaCalculada = false; // ❌ CORREÇÃO AQUI
  		}
  		window.atualizarTotalComTaxa();
  		window.atualizarBotaoWhatsApp(); // 👈 CORREÇÃO AQUI
  	  }
  	});
  });

  document.querySelectorAll('input[name="pagamento"]').forEach((radio) => {
  	radio.addEventListener("change", () => {
  	  const valorInput = document.getElementById("valorTroco");
  	  if (popupTroco && valorInput && resumoTroco) {
  		if (radio.value === "Dinheiro" && radio.checked) {
  		  popupTroco.style.display = "block";
  		  popupTroco.setAttribute("aria-hidden", "false");
  		  valorInput.focus();
  		} else {
  		  popupTroco.style.display = "none";
  		  popupTroco.setAttribute("aria-hidden", "true");
  		  resumoTroco.style.display = "none";
  		  resumoTroco.textContent = "";
  		}
  	  }
  	});
  });

  if (btnConfirmarTroco)
  	btnConfirmarTroco.addEventListener("click", () => {
  	  const valorInput = document.getElementById("valorTroco");
  	  const revTotalEl = document.getElementById("revTotal");
  	  if (valorInput && revTotalEl && resumoTroco && popupTroco) {
  		const valor = parseFloat(valorInput.value);
  		const totalPedido = parseFloat(
  		  revTotalEl.textContent.replace("R$", "").replace(",", ".").trim()
  		);
  		if (isNaN(valor) || valor <= 0)
  		  return alert("Por favor, insira um valor válido.");
  		if (valor < totalPedido)
  		  return alert(
  			"O valor para troco deve ser maior ou igual ao total do pedido."
  		  );
  		resumoTroco.textContent = `Troco para R$ ${valor
  		  .toFixed(2)
  		  .replace(".", ",")}`;
  		resumoTroco.style.display = "block";
  		valorInput.blur();
  		popupTroco.style.display = "none";
  		popupTroco.setAttribute("aria-hidden", "true");
  	  }
  	});

  // if (inputEndereco) inputEndereco.addEventListener("input", atualizarBotaoWhatsApp); // <-- LINHA REMOVIDA (DUPLICADA)

  // ==========================================================
  // BLOCO 4: ADIÇÃO DOS LISTENERS DO MAPA
  // ==========================================================
  if (btnFecharMapa) {
    btnFecharMapa.addEventListener("click", () => {
        if(modalMapa) modalMapa.classList.remove("aberto");
        updateModalState(false);
    });
  }
  if (btnConfirmarPino) {
    btnConfirmarPino.addEventListener("click", confirmarPosicaoPino);
  }
  if (btnUsarLocalizacao) {
    // Se você remover o botão "Usar Localização" do HTML,
    // esta linha será ignorada sem causar erro.
    btnUsarLocalizacao.addEventListener("click", usarLocalizacaoAtual);
  }

  // --- 4. Inicializa os Módulos Admin ---
  initModerador();
  initPainelAdicionais();

  // --- 5. Força Estado Inicial ---
  atualizarSacola();
  window.atualizarBotaoWhatsApp(); // 👈 CORREÇÃO AQUI
  const tipoInicialRadio = document.querySelector(
  	'input[name="tipoEntrega"]:checked'
  );
  const tipoInicial = tipoInicialRadio ? tipoInicialRadio.value : "entrega";
  if (inputEndereco) inputEndereco.disabled = tipoInicial === "retirada";
  const campoEnderecoEl = document.getElementById("campoEndereco");
  const infoRetiradaEl = document.getElementById("infoRetirada");
  if (campoEnderecoEl && infoRetiradaEl) {
  	if (tipoInicial === "retirada") {
  	  campoEnderecoEl.style.display = "none";
  	  infoRetiradaEl.style.display = "block";
  	} else {
  	  campoEnderecoEl.style.display = "block";
  	  infoRetiradaEl.style.display = "none";
  	}
  }
});

// ==========================================================
// ===== FIM DO ARQUIVO =====
// ==========================================================