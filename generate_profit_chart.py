import sys
import json
import os
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import cloudinary
import cloudinary.uploader

# Função para imprimir mensagens de erro no stderr e sair.
def fail(message):
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)

# Configuração do Cloudinary
try:
    cloudinary.config(
        cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
        api_key=os.getenv("CLOUDINARY_API_KEY"),
        api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    )
    if not all([os.getenv("CLOUDINARY_CLOUD_NAME"), os.getenv("CLOUDINARY_API_KEY"), os.getenv("CLOUDINARY_API_SECRET")]):
        raise ValueError("Credenciais do Cloudinary nao estao totalmente configuradas.")
except Exception as e:
    fail(f"Erro na configuracao do Cloudinary: {e}")

def create_profit_chart(data, image_path):
    """
    Gera um gráfico de barras comparando ganhos e gastos diários.
    """
    if not data:
        fail("Dados vazios recebidos. Nao e possivel gerar o grafico.")
        return

    df = pd.DataFrame(data)

    if 'income' not in df.columns:
        df['income'] = 0
    if 'expense' not in df.columns:
        df['expense'] = 0
    df.fillna(0, inplace=True) 

    df['date'] = pd.to_datetime(df['date'])
    df.sort_values('date', inplace=True)
    df['formatted_date'] = df['date'].dt.strftime('%d/%m')

    plt.style.use('seaborn-v0_8-whitegrid')
    fig, ax = plt.subplots(figsize=(12, 7))

    bar_width = 0.4
    index = range(len(df)) # Usar range para evitar problemas com index do pandas

    bars_income = ax.bar([i - bar_width/2 for i in index], df['income'], bar_width, label='Ganhos', color='#4CAF50', edgecolor='black')
    bars_expense = ax.bar([i + bar_width/2 for i in index], df['expense'], bar_width, label='Gastos', color='#F44336', edgecolor='black')

    ax.set_title('Resumo de Ganhos vs. Gastos Diários', fontsize=16, fontweight='bold', pad=20)
    ax.set_ylabel('Valor (R$)', fontsize=12)
    ax.set_xlabel('Data', fontsize=12)

    formatter = mticker.FormatStrFormatter('R$ %.2f')
    ax.yaxis.set_major_formatter(formatter)
    
    ax.set_xticks(index)
    ax.set_xticklabels(df['formatted_date'], rotation=45, ha="right")

    ax.legend()
    fig.tight_layout()
    plt.savefig(image_path, dpi=100)
    plt.close()
    
    # MUDANÇA: A mensagem de status foi removida. O Node.js já loga o progresso.
    # print(f"Grafico salvo em: {image_path}", file=sys.stderr) <-- Removido

def upload_to_cloudinary(image_path):
    """
    Faz o upload da imagem para o Cloudinary e retorna a URL segura.
    """
    try:
        upload_response = cloudinary.uploader.upload(image_path, folder="adap_reports")
        return upload_response.get('secure_url')
    except Exception as e:
        # Erro de upload é um erro real, então usamos fail().
        fail(f"Erro no upload para Cloudinary: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) != 3:
        fail("Uso incorreto. Esperado: python generate_profit_chart.py <json_in> <image_out>")

    json_path = sys.argv[1]
    image_path = sys.argv[2]

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            report_data = json.load(f)

        create_profit_chart(report_data, image_path)
        
        image_url = upload_to_cloudinary(image_path)

        if image_url:
            # MUDANÇA: A única coisa impressa no stdout em caso de sucesso é a URL.
            print(image_url)
        else:
            # Se a URL não for retornada, consideramos uma falha.
            fail("Nao foi possivel obter a URL da imagem apos o upload.")

    except FileNotFoundError:
        fail(f"Arquivo JSON nao encontrado em {json_path}")
    except json.JSONDecodeError:
        fail(f"JSON invalido em {json_path}")
    except Exception as e:
        fail(f"Um erro inesperado ocorreu: {e}")
    finally:
        # Limpeza de arquivos temporários
        if os.path.exists(json_path):
            os.remove(json_path)
        if os.path.exists(image_path):
            os.remove(image_path)