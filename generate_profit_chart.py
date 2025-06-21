import sys
import json
import os
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import cloudinary
import cloudinary.uploader
import pandas as pd

# --- Configuração do Cloudinary ---
# Carrega as credenciais das variáveis de ambiente para segurança.
try:
    cloudinary.config(
        cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
        api_key=os.getenv("CLOUDINARY_API_KEY"),
        api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    )
except Exception as e:
    print(f"Erro na configuracao do Cloudinary: {e}", file=sys.stderr)
    sys.exit(1)

def create_profit_chart(data, image_path):
    """
    Gera um gráfico de barras comparando ganhos e gastos diários.
    """
    if not data:
        print("Dados vazios, nenhum gráfico gerado.", file=sys.stderr)
        return

    # Converte os dados JSON para um DataFrame do Pandas, que é ótimo para manipulação.
    df = pd.DataFrame(data)

    # Garante que as colunas de ganho e gasto existam, preenchendo com 0 se faltarem.
    if 'income' not in df.columns:
        df['income'] = 0
    if 'expense' not in df.columns:
        df['expense'] = 0
    df.fillna(0, inplace=True) # Substitui qualquer valor nulo (NaN) por 0.

    # Converte a coluna de data para o formato datetime e a formata para "dd/mm".
    df['date'] = pd.to_datetime(df['date'])
    df.sort_values('date', inplace=True)
    df['formatted_date'] = df['date'].dt.strftime('%d/%m')

    # --- Criação do Gráfico ---
    plt.style.use('seaborn-v0_8-whitegrid')
    fig, ax = plt.subplots(figsize=(12, 7))

    bar_width = 0.4
    index = df.index

    # Cria as barras de Ganhos (verde) e Gastos (vermelho).
    bars_income = ax.bar(index - bar_width/2, df['income'], bar_width, label='Ganhos', color='#4CAF50', edgecolor='black')
    bars_expense = ax.bar(index + bar_width/2, df['expense'], bar_width, label='Gastos', color='#F44336', edgecolor='black')

    # Configurações de Título e Rótulos.
    ax.set_title('Resumo de Ganhos vs. Gastos Diários', fontsize=16, fontweight='bold', pad=20)
    ax.set_ylabel('Valor (R$)', fontsize=12)
    ax.set_xlabel('Data', fontsize=12)

    # Formata o eixo Y para exibir como moeda (R$).
    formatter = mticker.FormatStrFormatter('R$ %.2f')
    ax.yaxis.set_major_formatter(formatter)
    
    # Configura os marcadores do eixo X para serem as datas formatadas.
    ax.set_xticks(index)
    ax.set_xticklabels(df['formatted_date'], rotation=45, ha="right")

    ax.legend()
    fig.tight_layout() # Ajusta o layout para evitar sobreposição.

    # Salva a imagem gerada no caminho especificado.
    plt.savefig(image_path, dpi=100)
    plt.close()
    print(f"Grafico salvo em: {image_path}", file=sys.stderr)


def upload_to_cloudinary(image_path):
    """
    Faz o upload da imagem para o Cloudinary e retorna a URL segura.
    """
    try:
        upload_response = cloudinary.uploader.upload(image_path, folder="adap_reports")
        return upload_response.get('secure_url')
    except Exception as e:
        print(f"Erro no upload para Cloudinary: {e}", file=sys.stderr)
        return None

if __name__ == "__main__":
    # Verifica se os argumentos de linha de comando foram passados corretamente.
    if len(sys.argv) != 3:
        print("Uso: python generate_profit_chart.py <caminho_json_entrada> <caminho_imagem_saida>", file=sys.stderr)
        sys.exit(1)

    json_path = sys.argv[1]
    image_path = sys.argv[2]

    try:
        # Carrega os dados do arquivo JSON.
        with open(json_path, 'r', encoding='utf-8') as f:
            report_data = json.load(f)

        # 1. Gera o gráfico e salva localmente.
        create_profit_chart(report_data, image_path)

        # 2. Faz o upload da imagem gerada.
        image_url = upload_to_cloudinary(image_path)

        if image_url:
            # 3. Imprime a URL para o Node.js capturar (saída padrão).
            print(image_url)
        else:
            sys.exit(1)

    except FileNotFoundError:
        print(f"Erro: Arquivo JSON nao encontrado em {json_path}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"Erro: JSON invalido em {json_path}", file=sys.stderr)
        sys.exit(1)
    finally:
        # 4. Limpa os arquivos temporários, independentemente do resultado.
        if os.path.exists(json_path):
            os.remove(json_path)
        if os.path.exists(image_path):
            os.remove(image_path)