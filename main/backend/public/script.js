const token = localStorage.getItem('token');

if (!token) {
    window.location.href = 'index.html';
}

const gastoForm = document.getElementById('gastoForm');
const listaGastos = document.getElementById('listaGastos');
const totalGastosEl = document.getElementById('totalGastos');
const botoesMeses = document.getElementById('botoes-meses');
const mensagemEl = document.getElementById('messageBox');
const semGastosEl = document.getElementById('semGastos');
const limiteForm = document.getElementById('limiteForm');
const limiteValorEl = document.getElementById('limite-valor');
const gastoTotalMesEl = document.getElementById('gasto-total-mes');
const budgetAlert = document.getElementById('budget-alert');

const pagamentoModal = document.getElementById('pagamentoModal');
const pagamentoForm = document.getElementById('pagamentoForm');
const fecharPagamentoModal = document.getElementById('fecharPagamentoModal');
const pagamentoGastoId = document.getElementById('pagamentoGastoId');
const pagamentoValorTotal = document.getElementById('pagamentoValorTotal');
const pagamentoValorPago = document.getElementById('pagamentoValorPago');
const pagamentoSaldoRestante = document.getElementById('pagamentoSaldoRestante');

const editarModal = document.getElementById('editarModal');
const editarGastoForm = document.getElementById('editarGastoForm');
const fecharEditarModal = document.getElementById('fecharEditarModal');
const editarGastoId = document.getElementById('editarGastoId');
const editarDescricao = document.getElementById('editarDescricao');
const editarValor = document.getElementById('editarValor');
const editarVencimento = document.getElementById('editarVencimento');

let gastosCache = [];
let limiteMensal = 0;
let mesAtual = new Date().getMonth() + 1;
let anoAtual = new Date().getFullYear();

function showMessage(msg, type = 'success') {
    mensagemEl.textContent = msg;
    mensagemEl.className = `message-box ${type}`;
    mensagemEl.style.display = 'block';
    setTimeout(() => {
        mensagemEl.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => {
            mensagemEl.style.display = 'none';
            mensagemEl.style.animation = '';
        }, 300);
    }, 3000);
}

async function carregarLimite() {
    if (mesAtual === 'todos') {
        limiteMensal = 0;
        limiteValorEl.textContent = 'R$ 0.00 (Não definido)';
        budgetAlert.classList.add('hidden');
        return;
    }

    try {
        const response = await fetch(`/limite-gastos?mes=${mesAtual}&ano=${anoAtual}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            limiteMensal = data.limite || 0;
            limiteValorEl.textContent = `R$ ${parseFloat(limiteMensal).toFixed(2)}`;
        } else {
            limiteMensal = 0;
            limiteValorEl.textContent = 'R$ 0.00 (Não definido)';
        }
    } catch (error) {
        console.error('Erro ao carregar limite:', error);
    }
}

function verificarLimite(total) {
    if (limiteMensal > 0 && total > limiteMensal) {
        budgetAlert.classList.remove('hidden');
        budgetAlert.classList.remove('budget-ok');
        budgetAlert.classList.add('budget-warning');
        const excedente = total - limiteMensal;
        budgetAlert.innerHTML = `<strong>Atenção!</strong> Você excedeu seu limite de gastos em R$ ${excedente.toFixed(2)}.`;
    } else if (limiteMensal > 0) {
        budgetAlert.classList.remove('hidden');
        budgetAlert.classList.remove('budget-warning');
        budgetAlert.classList.add('budget-ok');
        const restante = limiteMensal - total;
        budgetAlert.innerHTML = `<strong>Parabéns!</strong> Você ainda tem R$ ${restante.toFixed(2)} disponíveis.`;
    } else {
        budgetAlert.classList.add('hidden');
    }
}

async function carregarGastos(mesSelecionado = mesAtual) {
    mesAtual = mesSelecionado;
    anoAtual = new Date().getFullYear();
    await carregarLimite();

    try {
        const response = await fetch('/gastos', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Erro ao carregar gastos.');
        }

        gastosCache = await response.json();
        
        let gastosFiltrados = gastosCache;
        let total = 0;

        if (mesSelecionado !== 'todos') {
            gastosFiltrados = gastosCache.filter(gasto => {
                const dataVencimento = new Date(gasto.vencimento);
                return (dataVencimento.getMonth() + 1) === parseInt(mesSelecionado) && dataVencimento.getFullYear() === anoAtual;
            });
        }
        
        listaGastos.innerHTML = '';

        if (gastosFiltrados.length === 0) {
            semGastosEl.classList.remove('hidden');
        } else {
            semGastosEl.classList.add('hidden');
            gastosFiltrados.forEach(gasto => {
                const li = document.createElement('li');
                li.className = 'caixa-dados-item';
                
                const dataVencimento = new Date(gasto.vencimento).toLocaleDateString('pt-BR');
                const valorFixo = parseFloat(gasto.valor).toFixed(2);
                const valorPagoFixo = parseFloat(gasto.valor_pago).toFixed(2);
                
                let statusClass = '';
                let statusText = '';
                if (gasto.status === 'pago') {
                    statusClass = 'bg-green-200 text-green-800';
                    statusText = 'Pago';
                } else if (gasto.status === 'parcialmente pago') {
                    statusClass = 'bg-yellow-200 text-yellow-800';
                    statusText = 'Parcialmente Pago';
                } else {
                    statusClass = 'bg-red-200 text-red-800';
                    statusText = 'Pendente';
                }

                const vencida = new Date(gasto.vencimento) < new Date() && gasto.status !== 'pago';

                li.innerHTML = `
                    <div class="flex flex-col md:flex-row md:justify-between md:items-center w-full">
                        <div class="flex-1">
                            <strong class="text-lg">${gasto.descricao}</strong>
                            <p class="text-sm text-gray-500">
                                Vencimento: ${dataVencimento}
                                ${vencida ? '<span class="text-red-500 font-bold ml-2">VENCIDA!</span>' : ''}
                            </p>
                            <span class="inline-block mt-1 px-2 py-1 text-xs font-semibold rounded-full ${statusClass}">${statusText}</span>
                        </div>
                        <div class="mt-2 md:mt-0 md:text-right">
                            <span class="text-lg font-bold">R$ ${valorFixo}</span>
                            <p class="text-sm text-gray-500">Pago: R$ ${valorPagoFixo}</p>
                            <div class="flex space-x-2 mt-2">
                                <button class="btn-pagar bg-green-500 hover:bg-green-600 text-white p-1 rounded-full text-xs" data-id="${gasto.id}">Pagar</button>
                                <button class="btn-editar bg-blue-500 hover:bg-blue-600 text-white p-1 rounded-full text-xs" data-id="${gasto.id}">Editar</button>
                                <button class="btn-deletar bg-red-500 hover:bg-red-600 text-white p-1 rounded-full text-xs" data-id="${gasto.id}">Deletar</button>
                            </div>
                        </div>
                    </div>
                `;
                listaGastos.appendChild(li);
                total += parseFloat(gasto.valor);
            });
        }
        
        totalGastosEl.textContent = `Total: R$ ${total.toFixed(2)}`;
        gastoTotalMesEl.textContent = `R$ ${total.toFixed(2)}`;

        if (mesSelecionado !== 'todos') {
            verificarLimite(total);
        } else {
            budgetAlert.classList.add('hidden');
        }

    } catch (error) {
        console.error('Erro:', error);
        showMessage('Não foi possível carregar os gastos.', 'error');
    }
}

limiteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const novoLimite = parseFloat(document.getElementById('novoLimite').value);

    if (isNaN(novoLimite) || novoLimite < 0) {
        showMessage('Por favor, insira um valor válido para o limite.', 'error');
        return;
    }

    if (mesAtual === 'todos') {
        showMessage('Por favor, selecione um mês para definir o limite de gastos.', 'error');
        return;
    }

    try {
        const response = await fetch('/limite-gastos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ limite: novoLimite, mes: mesAtual, ano: anoAtual })
        });

        if (response.ok) {
            showMessage('Limite salvo com sucesso!', 'success');
            limiteForm.reset();
            carregarGastos(mesAtual);
        } else {
            const errorData = await response.json();
            showMessage(errorData.error || 'Erro ao salvar o limite.', 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        showMessage('Não foi possível salvar o limite.', 'error');
    }
});

gastoForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const descricao = document.getElementById('descricao').value.trim();
    const valor = parseFloat(document.getElementById('valor').value);
    const vencimento = document.getElementById('vencimento').value;

    if (!descricao || isNaN(valor) || valor <= 0 || !vencimento) {
        showMessage('Por favor, preencha todos os campos corretamente.', 'error');
        return;
    }

    try {
        const response = await fetch('/gastos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ descricao, valor, vencimento })
        });

        if (response.ok) {
            showMessage('Gasto adicionado com sucesso!', 'success');
            gastoForm.reset();
            carregarGastos('todos');
        } else {
            const errorData = await response.json();
            showMessage(errorData.error || 'Erro ao adicionar gasto.', 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        showMessage('Não foi possível adicionar o gasto. Verifique sua conexão ou tente novamente.', 'error');
    }
});

botoesMeses.addEventListener('click', (e) => {
    const botaoClicado = e.target;
    if (botaoClicado.tagName === 'BUTTON') {
        botoesMeses.querySelectorAll('button').forEach(btn => {
            btn.classList.remove('bg-blue-500', 'text-white');
            btn.classList.add('bg-gray-200', 'text-gray-800', 'hover:bg-gray-300');
        });
        botaoClicado.classList.add('bg-blue-500', 'text-white');
        botaoClicado.classList.remove('bg-gray-200', 'text-gray-800', 'hover:bg-gray-300');
        
        const mesSelecionado = botaoClicado.dataset.mes;
        carregarGastos(mesSelecionado);
    }
});

listaGastos.addEventListener('click', async (e) => {
    const id = e.target.dataset.id;
    if (!id) return;

    if (e.target.classList.contains('btn-deletar')) {
        if (confirm('Tem certeza que deseja deletar este gasto?')) {
            try {
                const response = await fetch(`/gastos/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    showMessage('Gasto deletado com sucesso!', 'success');
                    carregarGastos(mesAtual);
                } else {
                    const errorData = await response.json();
                    showMessage(errorData.error || 'Erro ao deletar gasto.', 'error');
                }
            } catch (error) {
                console.error('Erro:', error);
                showMessage('Não foi possível deletar o gasto.', 'error');
            }
        }
    } else if (e.target.classList.contains('btn-pagar')) {
        const gasto = gastosCache.find(g => g.id === parseInt(id));
        if (gasto) {
            pagamentoGastoId.value = gasto.id;
            pagamentoValorTotal.textContent = parseFloat(gasto.valor).toFixed(2);
            pagamentoValorPago.textContent = parseFloat(gasto.valor_pago).toFixed(2);
            pagamentoSaldoRestante.textContent = (parseFloat(gasto.valor) - parseFloat(gasto.valor_pago)).toFixed(2);
            pagamentoModal.classList.add('open');
        }
    } else if (e.target.classList.contains('btn-editar')) {
        const gasto = gastosCache.find(g => g.id === parseInt(id));
        if (gasto) {
            const vencimentoGasto = new Date(gasto.vencimento).toISOString().split('T')[0];

            editarGastoId.value = gasto.id;
            editarDescricao.value = gasto.descricao;
            editarValor.value = gasto.valor;
            editarVencimento.value = vencimentoGasto;
            editarModal.classList.add('open');
        }
    }
});

pagamentoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = pagamentoGastoId.value;
    const valorPagamento = parseFloat(document.getElementById('valorPagamento').value);

    try {
        const response = await fetch(`/gastos/pagar/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ valor_pagamento: valorPagamento })
        });

        if (response.ok) {
            showMessage('Pagamento registrado com sucesso!', 'success');
            pagamentoModal.classList.remove('open');
            pagamentoForm.reset();
            carregarGastos(mesAtual);
        } else {
            const errorData = await response.json();
            showMessage(errorData.error || 'Erro ao registrar pagamento.', 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        showMessage('Não foi possível registrar o pagamento.', 'error');
    }
});

editarGastoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editarGastoId.value;
    const descricao = editarDescricao.value.trim();
    const valor = parseFloat(editarValor.value);
    const vencimento = editarVencimento.value;

    if (!descricao || isNaN(valor) || valor <= 0 || !vencimento) {
        showMessage('Por favor, preencha todos os campos corretamente.', 'error');
        return;
    }

    try {
        const response = await fetch(`/gastos/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ descricao, valor, vencimento })
        });

        if (response.ok) {
            showMessage('Gasto editado com sucesso!', 'success');
            editarModal.classList.remove('open');
            editarGastoForm.reset();
            carregarGastos(mesAtual);
        } else {
            const errorData = await response.json();
            showMessage(errorData.error || 'Erro ao editar gasto.', 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        showMessage('Não foi possível editar o gasto.', 'error');
    }
});

fecharPagamentoModal.addEventListener('click', () => {
    pagamentoModal.classList.remove('open');
});

fecharEditarModal.addEventListener('click', () => {
    editarModal.classList.remove('open');
});

document.getElementById('logout').addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = 'index.html';
});

carregarGastos(mesAtual);
